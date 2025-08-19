import formidable from "formidable";
import { put } from "@vercel/blob";
import fetch from "node-fetch";

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

    // Extract candidate information
    const candidateInfo = {
      candidateEmail: Array.isArray(fields.candidateEmail) ? fields.candidateEmail[0] : fields.candidateEmail,
      recordId: Array.isArray(fields.recordId) ? fields.recordId[0] : fields.recordId,
      candidateName: Array.isArray(fields.candidateName) ? fields.candidateName[0] : fields.candidateName,
    };

    if (!candidateInfo.recordId) {
      throw new Error("Missing recordId in form submission");
    }

    console.log("Processing files for candidate:", candidateInfo.candidateName);

    // Process files for Airtable
    const attachments = {};

    const fileTypes = [
      { key: "identityProof", field: "Identity Proof", type: "IdentityProof" },
      { key: "addressProof", field: "Address Proof", type: "AddressProof" },
      { key: "offerLetter", field: "Offer Letter", type: "OfferLetter" },
    ];

    for (const { key, field, type } of fileTypes) {
      if (files[key]) {
        const file = Array.isArray(files[key]) ? files[key][0] : files[key];
        attachments[field] = await processFileForAirtable(file, candidateInfo.recordId, type);
      }
    }

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
    });
  }
}

// Convert file to Airtable attachment format
async function processFileForAirtable(file, recordId, documentType) {
  try {
    const ext = file.originalFilename.split(".").pop();
    const filename = `${recordId}_${documentType}.${ext}`;
    
    // Read file content
    const fileContent = require("fs").readFileSync(file.filepath);
    
    // Upload to Vercel Blob
    const { url } = await put(filename, fileContent, { access: "public" });
    
    // Clean up temp file
    require("fs").unlinkSync(file.filepath);
    
    return {
      filename,
      url,
    };
  } catch (error) {
    console.error(`Error processing file ${documentType}:`, error);
    throw error;
  }
}

// Update Airtable with documents
async function updateAirtableWithDocuments(candidateInfo, attachments) {
  try {
    const airtableApiToken = process.env.AIRTABLE_API_TOKEN;
    const baseId = "appMvECrw7CrJFCO0";
    const tableId = "tblqaH9RrTO6JuG5N";

    if (!airtableApiToken) {
      throw new Error("AIRTABLE_API_TOKEN environment variable not found");
    }

    // Prepare update fields
    const fieldsToUpdate = {
      Status: "Documents Submitted",
      "Documents Submitted": true,
      ...(attachments["Identity Proof"] && { "Identity Proof": [attachments["Identity Proof"]] }),
      ...(attachments["Address Proof"] && { "Address Proof": [attachments["Address Proof"]] }),
      ...(attachments["Offer Letter"] && { "Offer Letter": [attachments["Offer Letter"]] }),
    };

    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableId}/${candidateInfo.recordId}`;

    const response = await fetch(airtableUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${airtableApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: fieldsToUpdate,
      }),
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
