// pages/api/upload-documents.js
import formidable from "formidable";
import AWS from "aws-sdk";
import fs from "fs";

export const config = {
  api: { bodyParser: false }, // Disable Next.js body parsing for formidable
};

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({ message: "Error parsing form data" });
    }

    try {
      const uploads = [];

      // Helper to normalize single/array file inputs
      const normalizeFile = (file) => (Array.isArray(file) ? file[0] : file);

      if (files.identityProof) {
        uploads.push(
          uploadToS3(normalizeFile(files.identityProof), process.env.S3_BUCKET_IDENTITY)
        );
      }

      if (files.addressProof) {
        uploads.push(
          uploadToS3(normalizeFile(files.addressProof), process.env.S3_BUCKET_ADDRESS)
        );
      }

      if (files.offerLetter) {
        uploads.push(
          uploadToS3(normalizeFile(files.offerLetter), process.env.S3_BUCKET_OFFER)
        );
      }

      const results = await Promise.all(uploads);

      return res.status(200).json({
        message: "All documents uploaded successfully",
        files: results,
      });
    } catch (e) {
      console.error("Upload error:", e);
      return res.status(500).json({ message: "Upload failed" });
    }
  });
}

function uploadToS3(file, bucketName) {
  const fileContent = fs.readFileSync(file.filepath);
  const params = {
    Bucket: bucketName,
    Key: file.originalFilename,
    Body: fileContent,
    ContentType: file.mimetype,
  };
  return s3.upload(params).promise();
}
