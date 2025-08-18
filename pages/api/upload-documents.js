// pages/api/upload-documents.js (Next.js)
// or routes/upload-documents.js (Express)
import formidable from "formidable";
import AWS from "aws-sdk";
import fs from "fs";

export const config = {
  api: { bodyParser: false } // required for formidable
};

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const form = formidable({ multiples: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ message: "Error parsing form" });

    try {
      const uploads = [];

      // Identity Proof → Bucket 1
      if (files.identityProof) {
        uploads.push(uploadToS3(files.identityProof, process.env.S3_BUCKET_IDENTITY));
      }

      // Address Proof → Bucket 2
      if (files.addressProof) {
        uploads.push(uploadToS3(files.addressProof, process.env.S3_BUCKET_ADDRESS));
      }

      // Offer Letter → Bucket 3
      if (files.offerLetter) {
        uploads.push(uploadToS3(files.offerLetter, process.env.S3_BUCKET_OFFER));
      }

      const results = await Promise.all(uploads);

      res.status(200).json({
        message: "All documents uploaded successfully",
        files: results
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Upload failed" });
    }
  });
}

function uploadToS3(file, bucketName) {
  const fileContent = fs.readFileSync(file.filepath);
  const params = {
    Bucket: bucketName,
    Key: file.originalFilename,
    Body: fileContent,
    ContentType: file.mimetype
  };

  return s3.upload(params).promise();
}
