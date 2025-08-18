import formidable from 'formidable';
   import Airtable from 'airtable';
   import AWS from 'aws-sdk';

   const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

   const s3 = new AWS.S3({
     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
     region: process.env.AWS_REGION
   });

   export default async function handler(req, res) {
     // Handle CORS
     res.setHeader('Access-Control-Allow-Origin', 'https://uploadpage-git-main-vaishnavi-lalwalas-projects.vercel.app');
     res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
     res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

     // Handle preflight requests (OPTIONS)
     if (req.method === 'OPTIONS') {
       return res.status(200).end();
     }

     if (req.method !== 'POST') {
       return res.status(405).json({ success: false, message: 'Method not allowed', code: 'INVALID_REQUEST_METHOD' });
     }

     const form = formidable({ multiples: true, maxFileSize: 4 * 1024 * 1024, maxTotalFileSize: 12 * 1024 * 1024 });

     try {
       const [fields, files] = await form.parse(req);

       // Extract fields
       const {
         candidateEmail = fields.candidateEmail?.[0],
         recordId = fields.recordId?.[0],
         candidateName = fields.candidateName?.[0],
         candidatePhone = fields.candidatePhone?.[0],
         position = fields.position?.[0],
         department = fields.department?.[0],
         startDate = fields.startDate?.[0],
         buddyName = fields.buddyName?.[0],
         buddyEmail = fields.buddyEmail?.[0],
         hrRep = fields.hrRep?.[0]
       } = fields;

       if (!candidateEmail || !recordId || !files.identityProof || !files.addressProof || !files.offerLetter) {
         return res.status(400).json({ success: false, message: 'Missing required fields or files' });
       }

       // Upload files to S3
       const uploadFile = async (file, keyPrefix) => {
         const fileContent = await import('fs').then(fs => fs.promises.readFile(file.filepath));
         const params = {
           Bucket: process.env.AWS_S3_BUCKET,
           Key: `${recordId}/${keyPrefix}-${file.originalFilename}`,
           Body: fileContent,
           ContentType: file.mimetype
         };
         const { Location } = await s3.upload(params).promise();
         return Location;
       };

       const identityProofUrl = await uploadFile(files.identityProof[0], 'identityProof');
       const addressProofUrl = await uploadFile(files.addressProof[0], 'addressProof');
       const offerLetterUrl = await uploadFile(files.offerLetter[0], 'offerLetter');

       // Update Airtable
       const record = await base('OnboardingForm').update([
         {
           id: recordId,
           fields: {
             Name: candidateName,
             Email: candidateEmail,
             Phone: candidatePhone,
             Position: position,
             Department: department,
             StartDate: startDate,
             BuddyName: buddyName,
             BuddyEmail: buddyEmail,
             HRRep: hrRep,
             IdentityProofUrl: identityProofUrl,
             AddressProofUrl: addressProofUrl,
             OfferLetterUrl: offerLetterUrl,
             Status: 'Documents Uploaded'
           }
         }
       ]);

       return res.status(200).json({ success: true, recordId: record[0].id });
     } catch (error) {
       console.error('Error in API:', error);
       let errorCode = 'FUNCTION_INVOCATION_FAILED';
       let status = 500;

       if (error.type === 'entity.too.large') {
         errorCode = 'FUNCTION_PAYLOAD_TOO_LARGE';
         status = 413;
       } else if (error.name === 'TimeoutError') {
         errorCode = 'FUNCTION_INVOCATION_TIMEOUT';
         status = 504;
       }

       return res.status(status).json({ success: false, error: error.message, code: errorCode });
     }
   }

   export const config = {
     api: {
       bodyParser: false
     }
   };
