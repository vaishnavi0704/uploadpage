// pages/api/upload-documents.js
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: { 
    bodyParser: false,
    externalResolver: true
  }
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  console.log("Starting file upload process...");

  try {
    // Initialize formidable
    const form = formidable({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit for Airtable
      multiples: true
    });

    // Parse the form
    const [fields, files] = await form.parse(req);
    
    console.log("Fields received:", fields);
    console.log("Files received:", Object.keys(files));

    // Extract candidate information
    const candidateInfo = {
      candidateEmail: Array.isArray(fields.candidateEmail) ? fields.candidateEmail[0] : fields.candidateEmail,
      recordId: Array.isArray(fields.recordId) ? fields.recordId[0] : fields.recordId,
      candidateName: Array.isArray(fields.candidateName) ? fields.candidateName[0] : fields.candidateName,
      position: Array.isArray(fields.position) ? fields.position[0] : fields.position,
      department: Array.isArray(fields.department) ? fields.department[0] : fields.department
    };

    console.log("Candidate info:", candidateInfo);

    // Prepare file attachments for Airtable
    const attachments = {};

    // Process Identity Proof
    if (files.identityProof) {
      const file = Array.isArray(files.identityProof) ? files.identityProof[0] : files.identityProof;
      console.log("Processing identity proof:", file.originalFilename);
      attachments.identityProof = await processFileForAirtable(file, 'identity');
    }

    // Process Address Proof
    if (files.addressProof) {
      const file = Array.isArray(files.addressProof) ? files.addressProof[0] : files.addressProof;
      console.log("Processing address proof:", file.originalFilename);
      attachments.addressProof = await processFileForAirtable(file, 'address');
    }

    // Process Offer Letter
    if (files.offerLetter) {
      const file = Array.isArray(files.offerLetter) ? files.offerLetter[0] : files.offerLetter;
      console.log("Processing offer letter:", file.originalFilename);
      attachments.offerLetter = await processFileForAirtable(file, 'offer');
    }

    // Update Airtable with documents
    const airtableResponse = await updateAirtableWithDocuments(candidateInfo, attachments);

    // Send data to N8N webhook
    try {
      console.log("Sending to N8N webhook...");
      
      const webhookData = {
        candidateEmail: candidateInfo.candidateEmail,
        recordId: candidateInfo.recordId,
        candidateName: candidateInfo.candidateName,
        position: candidateInfo.position,
        department: candidateInfo.department,
        
        // Document status
        documentsUploaded: true,
        identityProofUploaded: !!attachments.identityProof,
        addressProofUploaded: !!attachments.addressProof,
        offerLetterUploaded: !!attachments.offerLetter,
        
        submissionTime: new Date().toISOString(),
        airtableUpdated: airtableResponse.success
      };

      // Replace with your actual N8N webhook URL
      const n8nWebhookUrl = 'http://localhost:5678/webhook-test/onboarding-form-submit';
      
      const webhookResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookData)
      });

      if (!webhookResponse.ok) {
        console.warn("N8N webhook failed, but files were uploaded successfully");
      } else {
        console.log("N8N webhook successful");
      }

    } catch (webhookError) {
      console.error("N8N webhook error:", webhookError);
      // Don't fail the whole request if webhook fails
    }

    return res.status(200).json({
      success: true,
      message: "All documents uploaded successfully to Airtable",
      candidateInfo: candidateInfo,
      documentsProcessed: {
        identityProof: !!attachments.identityProof,
        addressProof: !!attachments.addressProof,
        offerLetter: !!attachments.offerLetter
      },
      airtableUpdate: airtableResponse
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Upload failed", 
      error: error.message,
      stack: error.stack
    });
  }
}

// Process file for Airtable attachment
async function processFileForAirtable(file, documentType) {
  try {
    console.log(`Processing ${documentType} file:`, file.originalFilename);
    
    // Read file content
    const fileContent = fs.readFileSync(file.filepath);
    const base64Content = fileContent.toString('base64');
    
    // Clean up temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (unlinkError) {
      console.warn("Could not delete temp file:", unlinkError.message);
    }
    
    // Return attachment object for Airtable
    return {
      filename: file.originalFilename,
      url: `data:${file.mimetype};base64,${base64Content}`
    };
    
  } catch (error) {
    console.error(`Error processing ${documentType} file:`, error);
    throw error;
  }
}

// Update Airtable with document attachments
async function updateAirtableWithDocuments(candidateInfo, attachments) {
  try {
    const airtableApiKey = process.env.AIRTABLE_API_KEY;
    const baseId = 'appMvECrw7CrJFCO0'; // Your base ID
    const tableId = 'tblqaH9RrTO6JuG5N'; // Your table ID
    
    if (!airtableApiKey) {
      throw new Error('AIRTABLE_API_KEY not found in environment variables');
    }

    // Prepare fields to update
    const fieldsToUpdate = {
      "Status": "Documents Submitted",
      "Documents Submitted": true
    };

    // Add attachments if they exist
    if (attachments.identityProof) {
      fieldsToUpdate["Identity Proof"] = [attachments.identityProof];
    }
    if (attachments.addressProof) {
      fieldsToUpdate["Address Proof"] = [attachments.addressProof];
    }
    if (attachments.offerLetter) {
      fieldsToUpdate["Offer Letter"] = [attachments.offerLetter];
    }

    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableId}/${candidateInfo.recordId}`;
    
    console.log("Updating Airtable record:", candidateInfo.recordId);
    
    const response = await fetch(airtableUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${airtableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: fieldsToUpdate
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable update failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("Airtable update successful");
    
    return { success: true, data: result };
    
  } catch (error) {
    console.error("Airtable update error:", error);
    return { success: false, error: error.message };
  }
}
// After successfully uploading documents and updating Airtable & N8N
return res.redirect(302, 'pages/success');


