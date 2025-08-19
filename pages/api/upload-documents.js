import formidable from "formidable";
import { put } from "@vercel/blob";
import fetch from "node-fetch";
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

    if (!candidateInfo.recordId) {
      throw new Error("Missing recordId in form submission");
    }

    console.log("Candidate info:", candidateInfo);

    // Process files for Airtable attachments
    const attachments = {};
    const fileTypes = [
      { key: "identityProof", field: "Identity Proof", type: "IdentityProof" },
      { key: "addressProof", field: "Address Proof", type: "AddressProof" }, // Fixed typo from AdressProof
      { key: "offerLetter", field: "Offer Letter", type: "OfferLetter" },
    ];

    for (const { key, field, type } of fileTypes) {
      if (files[key]) {
        const file = Array.isArray(files[key]) ? files[key][0] : files[key];
        console.log(`Processing ${type}:`, file.originalFilename);
        attachments[field] = await processFileForAirtable(file, candidateInfo.recordId, type);
      }
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
      stack: error.stack,
    });
  }
}

async function processFileForAirtable(file, recordId, documentType) {
  try {
    // Clean filename to avoid double extensions
    const cleanFilename = file.originalFilename.replace(/\.pdf\.pdf$/, ".pdf");
    const ext = cleanFilename.split(".").pop().toLowerCase();
    const filename = `${recordId}_${documentType}.${ext}`;
    
    console.log(`Processing file: ${file.originalFilename} -> ${filename}, size: ${file.size}, type: ${file.mimetype}`);
    
    // Read file content
    const fileContent = fs.readFileSync(file.filepath);
    
    // Upload to Vercel Blob
    const { url } = await put(filename, fileContent, { access: "public" });
    
    // Clean up temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (unlinkError) {
      console.warn(`Could not delete temp file ${file.filepath}:`, unlinkError.message);
    }
    
    // Return Airtable attachment format
    const attachment = {
      filename,
      url,
    };
    
    console.log(`Attachment prepared: ${filename}, URL: ${url}`);
    return attachment;
    
  } catch (error) {
    console.error(`Error processing file ${documentType}:`, error);
    throw error;
  }
}

async function updateAirtableWithDocuments(candidateInfo, attachments) {
  try {
    const airtableApiToken = process.env.AIRTABLE_API_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID || "appMvECrw7CrJFCO0";
    const tableId = process.env.AIRTABLE_TABLE_ID || "tblqaH9RrTO6JuG5N";

    console.log("Airtable API Token exists:", !!airtableApiToken);
    console.log("Base ID:", baseId);
    console.log("Table ID:", tableId);
    console.log("Record ID:", candidateInfo.recordId);

    if (!airtableApiToken) {
      throw new Error("AIRTABLE_API_TOKEN environment variable not found");
    }

    // Prepare update fields
    const fieldsToUpdate = {
      Status: "Documents Submitted",
      "Documents Submitted": true,
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
      fields: fieldsToUpdate,
    };

    console.log("Request body prepared:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(airtableUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${airtableApiToken}`,
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
