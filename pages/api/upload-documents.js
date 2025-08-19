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

  console.log("Starting document upload to Airtable...");

  try {
    const form = formidable({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      multiples: true
    });

    const [fields, files] = await form.parse(req);
    
    // Extract candidate information
    const candidateInfo = {
      candidateEmail: Array.isArray(fields.candidateEmail) ? fields.candidateEmail[0] : fields.candidateEmail,
      recordId: Array.isArray(fields.recordId) ? fields.recordId[0] : fields.recordId,
      candidateName: Array.isArray(fields.candidateName) ? fields.candidateName[0] : fields.candidateName
    };

    console.log("Processing files for candidate:", candidateInfo.candidateName);

    // Process files for Airtable
    const attachments = {};

    if (files.identityProof) {
      const file = Array.isArray(files.identityProof) ? files.identityProof[0] : files.identityProof;
      attachments.identityProof = await processFileForAirtable(file);
    }

    if (files.addressProof) {
      const file = Array.isArray(files.addressProof) ? files.addressProof[0] : files.addressProof;
      attachments.addressProof = await processFileForAirtable(file);
    }

    if (files.offerLetter) {
      const file = Array.isArray(files.offerLetter) ? files.offerLetter[0] : files.offerLetter;
      attachments.offerLetter = await processFileForAirtable(file);
    }

    // Update Airtable with documents
    const airtableResult = await updateAirtableWithDocuments(candidateInfo, attachments);

    return res.status(200).json({
      success: true,
      message: "Documents uploaded successfully to Airtable",
      candidateInfo: candidateInfo,
      documentsUploaded: {
        identityProof: !!attachments.identityProof,
        addressProof: !!attachments.addressProof,
        offerLetter: !!attachments.offerLetter
      },
      airtableUpdate: airtableResult
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Upload failed", 
      error: error.message
    });
  }
}

// Convert file to Airtable attachment format
async function processFileForAirtable(file) {
  try {
    const fileContent = fs.readFileSync(file.filepath);
    const base64Content = fileContent.toString('base64');
    
    // Clean up temp file
    fs.unlinkSync(file.filepath);
    
    return {
      filename: file.originalFilename,
      url: `data:${file.mimetype};base64,${base64Content}`
    };
  } catch (error) {
    console.error("Error processing file:", error);
    throw error;
  }
}

// Update Airtable with documents
async function updateAirtableWithDocuments(candidateInfo, attachments) {
  try {
    const airtableApiKey = process.env.AIRTABLE_API_KEY;
    const baseId = 'appMvECrw7CrJFCO0';
    const tableId = 'tblqaH9RrTO6JuG5N';
    
    if (!airtableApiKey) {
      throw new Error('AIRTABLE_API_KEY environment variable not found');
    }

    // Prepare update fields
    const fieldsToUpdate = {
      "Status": "Documents Submitted",
      "Documents Submitted": true
    };

    // Add attachments
    if (attachments.identityProof) {
      fieldsToUpdate["Identity Proof"] = [attachments.identityProof];
    }
    if (attachments.addressProof) {
      fieldsToUpdate["Address Proof"] = [attachments.addressProof];
    }
    if (attachments.offerLetter) {
      fieldsToUpdate["Offer Letter"] = [attachments.offerLetter];
    }

    const airtableUrl = `https://airtable.com/appMvECrw7CrJFCO0/tblqaH9RrTO6JuG5N/viwGHZwBSAJxtItfW/recbafNpqEanUglbT?blocks=hide`;
    
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
    console.log("Airtable updated successfully for:", candidateInfo.candidateName);
    
    return { success: true, data: result };
    
  } catch (error) {
    console.error("Airtable update error:", error);
    return { success: false, error: error.message };
  }
}
