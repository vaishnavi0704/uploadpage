'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function UploadPage() {
  const searchParams = useSearchParams();
  const recordId = searchParams.get('recordId');
  const candidateEmail = searchParams.get('candidateEmail') || 'test@example.com'; // Fallback or dynamic
  const candidateName = searchParams.get('candidateName') || 'Test User'; // Fallback or dynamic
  const [uploadedFiles, setUploadedFiles] = useState({
    identity: null,
    address: null,
    offer: null,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!recordId) {
    return <p>Missing record ID. Please access this page from the email link.</p>;
  }

  const validateFile = (file, expectedExt, type) => {
    if (!file) return `No file selected for ${type}`;
    const ext = file.name.split('.').pop().toLowerCase();
    return expectedExt.includes(ext) ? '' : `Invalid file type for ${type}. Expected: ${expectedExt.join(', ')}`;
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    setUploadedFiles((prev) => ({ ...prev, [type]: file }));
  };

  const submitDocuments = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const uploadedCount = Object.values(uploadedFiles).filter((file) => file !== null).length;
    if (uploadedCount !== 3) {
      setError('Please upload all three required documents.');
      setSubmitting(false);
      return;
    }

    // Validate file types
    const identityError = validateFile(uploadedFiles.identity, ['pdf', 'jpg', 'jpeg', 'png'], 'Identity Proof');
    const addressError = validateFile(uploadedFiles.address, ['pdf', 'jpg', 'jpeg', 'png'], 'Address Proof');
    const offerError = validateFile(uploadedFiles.offer, ['pdf'], 'Offer Letter');

    if (identityError || addressError || offerError) {
      setError([identityError, addressError, offerError].filter((e) => e).join('; '));
      setSubmitting(false);
      return;
    }

    console.log('🚀 SUBMIT BUTTON CLICKED');
    console.log('Files:', {
      identity: uploadedFiles.identity?.name,
      address: uploadedFiles.address?.name,
      offer: uploadedFiles.offer?.name,
    });

    const formData = new FormData();
    formData.append('candidateEmail', candidateEmail);
    formData.append('recordId', recordId);
    formData.append('candidateName', candidateName);
    formData.append('identityProof', uploadedFiles.identity);
    formData.append('addressProof', uploadedFiles.address);
    formData.append('offerLetter', uploadedFiles.offer);

    console.log('📝 Form data:', {
      candidateEmail,
      recordId,
      candidateName,
      identityProof: uploadedFiles.identity?.name,
      addressProof: uploadedFiles.address?.name,
      offerLetter: uploadedFiles.offer?.name,
    });

    try {
      const response = await fetch('/api/upload-documents', {
        method: 'POST',
        body: formData,
      });

      console.log('📨 Response received:', {
        status: response.status,
        statusText: response.statusText,
      });

      const result = await response.json();
      console.log('📊 Response JSON:', result);

      if (response.ok) {
        console.log('✅ Upload successful!');
        alert('Thank you for submitting the documents!');
      } else {
        console.error('❌ Upload failed:', result);
        setError(result.error || result.message || 'Upload failed');
      }
    } catch (error) {
      console.error('🚨 Network error:', error);
      setError('Network error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>📄 Document Upload</h1>
      <p>Please upload the required documents</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={submitDocuments} encType="multipart/form-data">
        <div style={{ marginBottom: '20px' }}>
          <label>🆔 Identity Proof (Driver&apos;s License, Passport, or Government ID)</label><br />
          <input
            type="file"
            name="identityProof"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => handleFileChange(e, 'identity')}
            required
          />
          {uploadedFiles.identity && (
            <p>Selected: {uploadedFiles.identity.name} (Size: {(uploadedFiles.identity.size / 1024).toFixed(2)} KB)</p>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label>🏠 Address Proof (Utility Bill, Bank Statement, or Lease Agreement)</label><br />
          <input
            type="file"
            name="addressProof"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => handleFileChange(e, 'address')}
            required
          />
          {uploadedFiles.address && (
            <p>Selected: {uploadedFiles.address.name} (Size: {(uploadedFiles.address.size / 1024).toFixed(2)} KB)</p>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label>📋 Signed Offer Letter</label><br />
          <input
            type="file"
            name="offerLetter"
            accept=".pdf"
            onChange={(e) => handleFileChange(e, 'offer')}
            required
          />
          {uploadedFiles.offer && (
            <p>Selected: {uploadedFiles.offer.name} (Size: {(uploadedFiles.offer.size / 1024).toFixed(2)} KB)</p>
          )}
        </div>

        <button
          id="submitBtn"
          type="submit"
          disabled={submitting}
          style={{ padding: '10px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          {submitting ? <span>Submitting...</span> : 'Submit Documents'}
        </button>
      </form>
    </div>
  );
}
