// pages/api/upload-documents.js
import formidable from "formidable";
import AWS from "aws-sdk";
import fs from "fs";

export const config = {
  api: { 
    bodyParser: false,
    externalResolver: true
  }
};

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

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
    // Initialize formidable with correct syntax
    const form = formidable({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB limit
      multiples: true
    });

    // Parse the form - NEW SYNTAX
    const [fields, files] = await form.parse(req);
    
    console.log("Fields received:", fields);
    console.log("Files received:", Object.keys(files));

    // Extract candidate information
    const candidateInfo = {
      candidateEmail: Array.isArray(fields.candidateEmail) ? fields.candidateEmail[0] : fields.candidateEmail,
      recordId: Array.isArray(fields.recordId) ? fields.recordId[0] : fields.recordId,
      candidateName: Array.isArray(fields.candidateName) ? fields.candidateName[0] : fields.candidateName
    };

    console.log("Candidate info:", candidateInfo);

    // Prepare uploads
    const uploads = [];
    const uploadResults = {};

    // Upload Identity Proof
    if (files.identityProof) {
      const file = Array.isArray(files.identityProof) ? files.identityProof[0] : files.identityProof;
      console.log("Uploading identity proof:", file.originalFilename);
      
      const result = await uploadToS3(file, 'onboarding-documents', 'identity', candidateInfo);
      uploadResults.identityProofUrl = result.Location;
      uploads.push(result);
    }

    // Upload Address Proof
    if (files.addressProof) {
      const file = Array.isArray(files.addressProof) ? files.addressProof[0] : files.addressProof;
      console.log("Uploading address proof:", file.originalFilename);
      
      const result = await uploadToS3(file, 'onboarding-documents', 'address', candidateInfo);
      uploadResults.addressProofUrl = result.Location;
      uploads.push(result);
    }

    // Upload Offer Letter
    if (files.offerLetter) {
      const file = Array.isArray(files.offerLetter) ? files.offerLetter[0] : files.offerLetter;
      console.log("Uploading offer letter:", file.originalFilename);
      
      const result = await uploadToS3(file, 'onboarding-documents', 'offer', candidateInfo);
      uploadResults.offerLetterUrl = result.Location;
      uploads.push(result);
    }

    // Send data to N8N webhook
    try {
      console.log("Sending to N8N webhook...");
      
      const webhookData = {
        candidateEmail: candidateInfo.candidateEmail,
        recordId: candidateInfo.recordId,
        candidateName: candidateInfo.candidateName,
        identityProofUrl: uploadResults.identityProofUrl,
        addressProofUrl: uploadResults.addressProofUrl,
        offerLetterUrl: uploadResults.offerLetterUrl,
        submissionTime: new Date().toISOString(),
        documentsUploaded: true
      };

      // Replace this URL with your actual N8N webhook URL
      const n8nWebhookUrl = 'https://your-n8n-domain.com/webhook/onboarding-form-submit';
      
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
      message: "All documents uploaded successfully",
      files: uploadResults,
      candidateInfo: candidateInfo
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

// Updated S3 upload function
async function uploadToS3(file, bucketName, documentType, candidateInfo) {
  try {
    console.log("Reading file:", file.filepath);
    const fileContent = fs.readFileSync(file.filepath);
    
    const fileExtension = file.originalFilename.split('.').pop();
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `${documentType}-${candidateInfo.recordId}-${timestamp}.${fileExtension}`;

    const params = {
      Bucket: bucketName,
      Key: fileName,
      Body: fileContent,
      ContentType: file.mimetype,
      Metadata: {
        'candidate-email': candidateInfo.candidateEmail,
        'candidate-name': candidateInfo.candidateName,
        'document-type': documentType,
        'upload-date': new Date().toISOString()
      }
    };

    console.log("Uploading to S3:", params.Key);
    const result = await s3.upload(params).promise();
    
    // Clean up temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (unlinkError) {
      console.warn("Could not delete temp file:", unlinkError.message);
    }
    
    return result;
  } catch (error) {
    console.error("S3 upload error:", error);
    throw error;
  }
}
