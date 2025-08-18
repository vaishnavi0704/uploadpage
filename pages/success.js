// pages/success.js
export default function Success() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800">✅ Submission Successful</h1>
        <p className="text-lg text-gray-600 mt-4">
          Thank you for uploading your documents. We'll review them and get back to you soon.
        </p>
        <a
          href="/onboarding"
          className="mt-6 inline-block px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md"
        >
          Back to Onboarding
        </a>
      </div>
    </div>
  );
}
