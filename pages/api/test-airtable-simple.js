export default async function handler(req, res) {
  try {
    const airtableApiKey = process.env.AIRTABLE_API_KEY;
    
    if (!airtableApiKey) {
      return res.status(500).json({ error: 'No Airtable API key found' });
    }

    const updateData = {
      "Status": "Test Update - " + new Date().toISOString(),
      "Documents Submitted": true
    };

    const response = await fetch(
      'https://api.airtable.com/v0/appMvECrw7CrJFCO0/tblqaH9RrTO6JuG5N/recbafNpqEanUglbT',
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${airtableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: updateData
        })
      }
    );

    const result = await response.text();

    return res.status(200).json({
      success: response.ok,
      status: response.status,
      airtableResponse: result
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
