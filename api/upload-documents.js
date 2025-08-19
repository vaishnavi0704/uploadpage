import formidable from "formidable";
import fetch from "node-fetch";
import fs from "fs";

export const config = {
  api: { bodyParser: false, externalResolver: true },
  runtime: "nodejs"
};

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  console.log("Starting direct upload to Airtable (base64)…");

  try {
    const form = formidable({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // allow user up to 10MB, we'll reject >5MB before upload
      multiples: true
    });

    const [fields, files] = await form.parse(req);

    // Normalize candidate fields
    const candidateInfo = {
      candidateEmail: Array.isArray(fields.candidateEmail) ? fields.candidateEmail[0] : fields.candidateEmail,
      recordId: Array.isArray(fields.recordId) ? fields.recordId[0] : fields.recordId,
      candidateName: Array.isArray(fields.candidateName) ? fields.candidateName[0] : fields.candidateName
    };
    if (!candidateInfo.recordId) throw new Error("Missing recordId in form submission");

    // Prepare attachments by directly uploading file bytes to Airtable
    const attachments = {};
    const fileMap = [
      { inputKey: "identityProof", airtableField: "Identity Proof", label: "IdentityProof" },
      { inputKey: "addressProof",  airtableField: "Address Proof",  label: "AddressProof" },
      { inputKey: "offerLetter",   airtableField: "Offer Letter",   label: "OfferLetter" }
    ];

    for (const { inputKey, airtableField, label } of fileMap) {
      if (!files[inputKey]) continue;
      const f = Array.isArray(files[inputKey]) ? files[inputKey][0] : files[inputKey];
      const cleanName = (f.originalFilename || "file")
        .replace(/\.pdf\.pdf$/i, ".pdf")
        .replace(/[^\w.\-() ]+/g, "_");
      const ext = cleanName.split(".").pop()?.toLowerCase() || "";
      const finalName = `${candidateInfo.recordId}_${label}.${ext || "bin"}`;
      console.log(`Uploading ${label}: ${finalName} (${f.mimetype}, ${f.size} bytes)`);

      // Enforce ~5MB limit for Airtable base64 upload
      if (f.size > 5 * 1024 * 1024) {
        throw new Error(`${label} exceeds 5MB. Airtable base64 upload limit hit.`);
      }

      const bytes = fs.readFileSync(f.filepath);
      const base64 = bytes.toString("base64");

      // Upload to Airtable's Upload Attachment API (base64)
      const up = await uploadAttachmentToAirtable({
        base64,
        filename: finalName,
        contentType: f.mimetype || "application/octet-stream"
      });

      // Clean temp file
      try { fs.unlinkSync(f.filepath); } catch {}

      // Use the returned URL/filename for patching the record
      attachments[airtableField] = {
        url: up.url,
        filename: up.filename || finalName
      };
    }

    // Update the Airtable record with attachments + status
    const airtableUpdate = await updateAirtableRecord(candidateInfo, attachments);

    return res.status(200).json({
      success: true,
      message: "Documents uploaded directly to Airtable",
      candidateInfo,
      documentsUploaded: {
        identityProof: Boolean(attachments["Identity Proof"]),
        addressProof:  Boolean(attachments["Address Proof"]),
        offerLetter:   Boolean(attachments["Offer Letter"])
      },
      airtableUpdate
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
      error: err.message
    });
  }
}

/**
 * POST base64 file to Airtable "Upload Attachment" endpoint.
 * Returns an attachment object (including a usable URL) that Airtable hosts.
 */
async function uploadAttachmentToAirtable({ base64, filename, contentType }) {
  const token = process.env.AIRTABLE_API_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) throw new Error("Missing AIRTABLE_API_TOKEN or AIRTABLE_BASE_ID");

  // NOTE: This endpoint is documented by Airtable's Web API (base64 upload, ~5MB). :contentReference[oaicite:3]{index=3}
  const endpoint = `https://api.airtable.com/v0/bases/${encodeURIComponent(baseId)}/attachments/upload`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      file: base64,
      filename,
      contentType
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Upload Attachment failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  // Expected to include at least: { url, id, filename, size, type, ... }
  if (!data?.url) throw new Error("Upload Attachment returned no URL");
  return data;
}

/**
 * PATCH the Airtable record with the newly uploaded attachment URLs.
 */
async function updateAirtableRecord(candidateInfo, attachments) {
  const token = process.env.AIRTABLE_API_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableIdOrName = process.env.AIRTABLE_TABLE_ID || "tblqaH9RrTO6JuG5N";

  if (!token || !baseId) throw new Error("Missing AIRTABLE_API_TOKEN or AIRTABLE_BASE_ID");

  const fieldsToUpdate = {
    Status: "Documents Submitted",
    "Documents Submitted": true
  };

  if (attachments["Identity Proof"]) {
    fieldsToUpdate["Identity Proof"] = [attachments["Identity Proof"]];
  }
  if (attachments["Address Proof"]) {
    fieldsToUpdate["Address Proof"] = [attachments["Address Proof"]];
  }
  if (attachments["Offer Letter"]) {
    fieldsToUpdate["Offer Letter"] = [attachments["Offer Letter"]];
  }

  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableIdOrName)}/${encodeURIComponent(candidateInfo.recordId)}`;

  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: fieldsToUpdate })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Airtable update failed: ${resp.status} ${text}`);
  }

  const result = await resp.json();
  return { success: true, data: result };
}
