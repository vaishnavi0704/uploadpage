export default async function handler(req, res) {
  const envVars = {
    AIRTABLE_API_KEY: !!process.env.AIRTABLE_API_KEY,
    AIRTABLE_API_TOKEN: !!process.env.AIRTABLE_API_TOKEN,
    allEnvKeys: Object.keys(process.env).filter(key => 
      key.includes('AIRTABLE') || key.includes('VERCEL')
    )
  };
  
  console.log('Environment check:', envVars);
  
  return res.status(200).json(envVars);
}
