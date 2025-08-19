import formidable from "formidable";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  console.log('=== DEBUG API CALLED ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check environment variables
    const airtableApiKey = process.env.AIRTABLE_API_KEY;
    console.log('Environment check:');
    console.log('- AIRTABLE_API_KEY exists:', !!airtableApiKey);
    console.log('- AIRTABLE_API_KEY length:', airtableApiKey?.length || 0);
    console.log('- All env vars:', Object.keys(process.env).filter(key => key.includes('AIRTABLE')));

    // Parse form data
    const form = formidable({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024
    });

    const [fields, files] = await form.parse(req);
    
    console.log('=== FORM PARSING RESULTS ===');
    console.log('Fields:', fields);
    console.log('Files:', Object.keys(files));
    
    // Log file details
    Object.entries(files).forEach(([key, file]) => {
      const fileObj = Array.isArray(file) ? file[0] : file;
      console.log(`File ${key}:`, {
        originalFilename: fileObj.originalFilename,
        mimetype: fileObj.mimetype,
        size: fileObj.size,
        filepath: fileObj.filepath
      });
    });

    // Try simple Airtable test
    if (airtableApiKey) {
      const testUrl = `https://api.airtable.com/v0/appMvECrw7CrJFCO0/tblqaH9RrTO6JuG5N/recbafNpqEanUglbT`;
      
      console.log('Testing Airtable connection...');
      const testResponse = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${airtableApiKey}`
        }
      });
      
      console.log('Airtable test response status:', testResponse.status);
      const testResult = await testResponse.text();
      console.log('Airtable test response:', testResult);
    }

    return res.status(200).json({
      success: true,
      message: 'Debug API working',
      hasAirtableKey: !!airtableApiKey,
      fieldsReceived: Object.keys(fields),
      filesReceived: Object.keys(files),
      fileDetails: Object.fromEntries(
        Object.entries(files).map(([key, file]) => {
          const fileObj = Array.isArray(file) ? file[0] : file;
          return [key, {
            name: fileObj.originalFilename,
            size: fileObj.size,
            type: fileObj.mimetype
          }];
        })
      )
    });

  } catch (error) {
    console.error('Debug API error:', error);
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}
