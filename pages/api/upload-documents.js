// pages/api/upload-documents.js
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
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
      multiples: true,
    });

    const [fields, files] = await form.parse(req);
    
    console.log("Fields received:", fields);
    console.log("Files received:", Object.keys(files));

    // Extract candidate information
    const candidateInfo = {
      candidateEmail: Array.isArray(fields.candidateEmail) ? fields.candidateEmail[0] : fields.candidateEmail,
      recordId: Array.isArray(fields.recordId) ? fields.recordId[0] : fields.recordId,
      candidateName: Array.isArray(fields.candidateName) ? fields.candidateName[0] : fields.candidateName,
    };

    console.log("Candidate info:", candidateInfo);

    if (!candidateInfo.recordId) {
      throw new Error("Missing recordId in form submission");
    }

    // Process files for Airtable attachments
    const attachments = {};

    // Process Identity Proof
    if (files.identityProof) {
      const file = Array.isArray(files.identityProof) ? files.identityProof[0] : files.identityProof;
      console.log("Processing identity proof:", file.originalFilename);
      attachments["Identity Proof"] = await processFileForAirtable(file);
    }

    // Process Address Proof
    if (files.addressProof) {
      const file = Array.isArray(files.addressProof) ? files.addressProof[0] : files.addressProof;
      console.log("Processing address proof:", file.originalFilename);
      attachments["Address Proof"] = await processFileForAirtable(file);
    }

    // Process Offer Letter
    if (files.offerLetter) {
      const file = Array.isArray(files.offerLetter) ? files.offerLetter[0] : files.offerLetter;
      console.log("Processing offer letter:", file.originalFilename);
      attachments["Offer Letter"] = await processFileForAirtable(file);
    }

    console.log("Attachments prepared:", Object.keys(attachments));

    // Update Airtable with documents
    const airtableResult = await updateAirtableWithDocuments(candidateInfo, attachments);

    return res.status(200).json({
      success: true,
      message: "Documents uploaded successfully to Airtable",
      candidateInfo,
      documentsUploaded: {
        identityProof: !!attachments["Identity Proof"],
        addressProof: !!attachments["Address Proof"],
        offerLetter: !!attachments["Offer Letter"],
      },
      airtableUpdate: airtableResult,
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
async function submitDocuments() {
    console.log('🚀 SUBMIT BUTTON CLICKED');
    
    const uploadedCount = Object.values(uploadedFiles).filter(file => file !== null).length;
    if (uploadedCount !== 3) {
        console.log('❌ Not all files uploaded:', uploadedCount);
        showAlert('Please upload all three required documents.');
        return;
    }

    console.log('✅ All 3 files ready for upload');
    console.log('Files:', {
        identity: uploadedFiles.identity?.name,
        address: uploadedFiles.address?.name,
        offer: uploadedFiles.offer?.name
    });

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerHTML = '<span class="loading"></span>Submitting...';
    submitBtn.disabled = true;

    // Prepare form data
    const formData = new FormData();
    formData.append('candidateEmail', formConfig.candidateEmail || 'test@example.com');
    formData.append('recordId', formConfig.recordId || 'recbafNpqEanUglbT');
    formData.append('candidateName', formConfig.candidateName || 'Test User');
    
    console.log('📝 Form data:', {
        candidateEmail: formConfig.candidateEmail || 'test@example.com',
        recordId: formConfig.recordId || 'recbafNpqEanUglbT',
        candidateName: formConfig.candidateName || 'Test User'
    });

    // Add files
    if (uploadedFiles.identity) {
        formData.append('identityProof', uploadedFiles.identity);
        console.log('📎 Added identity proof:', uploadedFiles.identity.name);
    }
    if (uploadedFiles.address) {
        formData.append('addressProof', uploadedFiles.address);
        console.log('📎 Added address proof:', uploadedFiles.address.name);
    }
    if (uploadedFiles.offer) {
        formData.append('offerLetter', uploadedFiles.offer);
        console.log('📎 Added offer letter:', uploadedFiles.offer.name);
    }

    const webhookUrl = 'https://uploadpage-seven.vercel.app/api/upload-documents';
    console.log('🌐 Sending to:', webhookUrl);

    try {
        console.log('📤 Making API request...');
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            body: formData
        });

        console.log('📨 Response received:');
        console.log('- Status:', response.status);
        console.log('- Status Text:', response.statusText);
        console.log('- Headers:', Object.fromEntries(response.headers.entries()));

        const responseText = await response.text();
        console.log('📄 Raw response text:', responseText);

        let result;
        try {
            result = JSON.parse(responseText);
            console.log('📊 Parsed JSON response:', result);
        } catch (parseError) {
            console.error('❌ Failed to parse JSON:', parseError);
            console.log('Raw text was:', responseText);
        }

        if (response.ok) {
            console.log('✅ Upload successful!');
            alert('Documents uploaded successfully! Check Airtable and Vercel logs.');
        } else {
            console.error('❌ Upload failed with status:', response.status);
            alert('Upload failed: ' + (result?.message || result?.error || responseText));
        }

    } catch (error) {
        console.error('🚨 Network error:', error);
        alert('Network error: ' + error.message);
    } finally {
        submitBtn.innerHTML = 'Submit Documents';
        submitBtn.disabled = false;
    }
}
// Convert file to Airtable attachment format (Base64 method)
async function processFileForAirtable(file) {
  try {
    console.log(`Processing file: ${file.originalFilename}, size: ${file.size}, type: ${file.mimetype}`);
    
    // Read file content as base64
    const fileContent = fs.readFileSync(file.filepath);
    const base64Content = fileContent.toString('base64');
    
    // Clean up temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (unlinkError) {
      console.warn("Could not delete temp file:", unlinkError.message);
    }
    
    // Return Airtable attachment format
    const attachment = {
      filename: file.originalFilename,
      url: `data:${file.mimetype};base64,${base64Content}`
    };
    
    console.log(`Attachment prepared: ${file.originalFilename}`);
    return attachment;
    
  } catch (error) {
    console.error("Error processing file:", error);
    throw error;
  }
}

// Update Airtable with documents
async function updateAirtableWithDocuments(candidateInfo, attachments) {
  try {
    // Check for API key with both possible names
    const airtableApiKey = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_API_TOKEN;
    const baseId = "appMvECrw7CrJFCO0";
    const tableId = "tblqaH9RrTO6JuG5N";

    console.log("Airtable API Key exists:", !!airtableApiKey);
    console.log("Base ID:", baseId);
    console.log("Table ID:", tableId);
    console.log("Record ID:", candidateInfo.recordId);

    if (!airtableApiKey) {
      throw new Error("AIRTABLE_API_KEY or AIRTABLE_API_TOKEN environment variable not found");
    }

    // Prepare update fields
    const fieldsToUpdate = {
      "Status": "Documents Submitted",
      "Documents Submitted": true
    };

    // Add attachments if they exist
    if (attachments["Identity Proof"]) {
      fieldsToUpdate["Identity Proof"] = [attachments["Identity Proof"]];
      console.log("Added Identity Proof attachment");
    }
    
    if (attachments["Address Proof"]) {
      fieldsToUpdate["Address Proof"] = [attachments["Address Proof"]];
      console.log("Added Address Proof attachment");
    }
    
    if (attachments["Offer Letter"]) {
      fieldsToUpdate["Offer Letter"] = [attachments["Offer Letter"]];
      console.log("Added Offer Letter attachment");
    }

    console.log("Fields to update:", Object.keys(fieldsToUpdate));

    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableId}/${candidateInfo.recordId}`;
    console.log("Airtable URL:", airtableUrl);

    const requestBody = {
      fields: fieldsToUpdate
    };

    console.log("Request body prepared, making API call...");

    const response = await fetch(airtableUrl, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${airtableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Airtable response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Airtable error response:", errorText);
      throw new Error(`Airtable update failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("Airtable updated successfully for:", candidateInfo.candidateName);
    console.log("Updated fields:", Object.keys(result.fields || {}));

    return { success: true, data: result };
    
  } catch (error) {
    console.error("Airtable update error:", error);
    return { success: false, error: error.message };
  }
}
