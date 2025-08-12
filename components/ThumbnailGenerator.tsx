'use client';

import { useState, useCallback } from 'react';

export default function ThumbnailGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [failureCount, setFailureCount] = useState(0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const MAX_CONSECUTIVE_FAILURES = 5; // Stop after this many consecutive failures

  const generateAllThumbnails = useCallback(async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setSuccessCount(0);
      setFailureCount(0);
      setConsecutiveFailures(0);
      setSkippedCount(0);
      
      // Get the list of rings without thumbnails
      const response = await fetch('/api/rings-without-thumbnails');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get rings without thumbnails');
      }
      
      const { ringsWithoutThumbnails } = data;
      
      if (ringsWithoutThumbnails.length === 0) {
        setError('All rings already have thumbnails!');
        setIsGenerating(false);
        return;
      }
      
      // Update total count
      setProgress({ current: 0, total: ringsWithoutThumbnails.length });
      
      // Process each ring sequentially to avoid overwhelming the server
      for (let i = 0; i < ringsWithoutThumbnails.length; i++) {
        // Check if we should skip due to too many consecutive failures
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const remaining = ringsWithoutThumbnails.length - i;
          console.warn(`Skipping remaining ${remaining} items due to ${consecutiveFailures} consecutive failures`);
          setSkippedCount(remaining);
          setError(`Skipped ${remaining} items after ${consecutiveFailures} consecutive failures`);
          break;
        }
        
        const { category, model } = ringsWithoutThumbnails[i];
        
        // Update progress
        setProgress(prev => ({ ...prev, current: i + 1 }));
        
        try {
          console.log(`Starting thumbnail generation for ${category}/${model} (${i + 1}/${ringsWithoutThumbnails.length})`);
          
          // Generate thumbnail for this ring
          const generateResponse = await fetch('/api/generate-all-thumbnails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ category, model })
          });
          
          // Add a longer delay between each thumbnail generation to avoid socket hangups
          const delayTime = 5000; // 5 seconds between each request
          console.log(`Waiting ${delayTime}ms before next thumbnail...`);
          await new Promise(resolve => setTimeout(resolve, delayTime));
          
          let generateResult;
          try {
            generateResult = await generateResponse.json();
          } catch (jsonError) {
            throw new Error(`Server returned invalid JSON: ${generateResponse.statusText}`);
          }
          
          if (!generateResponse.ok) {
            const errorDetails = generateResult.details || generateResult.error || 'Unknown error';
            console.error(`Failed to generate thumbnail for ${category}/${model}:`, errorDetails);
            setFailureCount(prev => prev + 1);
            setConsecutiveFailures(prev => prev + 1);
          } else {
            console.log(`Successfully generated thumbnail for ${category}/${model}`);
            setSuccessCount(prev => prev + 1);
            setConsecutiveFailures(0); // Reset consecutive failures on success
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`Error generating thumbnail for ${category}/${model}:`, errorMessage);
          setFailureCount(prev => prev + 1);
          setConsecutiveFailures(prev => prev + 1);
          
          // Add a short pause after an error to let the system recover
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    } catch (err) {
      console.error('Error generating thumbnails:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginTop: '2rem',
      marginBottom: '2rem',
      padding: '1.5rem',
      backgroundColor: '#f5f0eb',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(139,115,85,0.1)',
      maxWidth: '500px',
      margin: '2rem auto',
    }}>
      <h2 style={{
        margin: '0 0 1rem 0',
        color: '#8b7355',
        fontSize: '1.5rem',
        fontWeight: '400',
      }}>
        Thumbnail Generator
      </h2>
      
      <button
        onClick={generateAllThumbnails}
        disabled={isGenerating}
        style={{
          backgroundColor: isGenerating ? '#cccccc' : '#D4AF37',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          padding: '10px 20px',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          fontWeight: '500',
          transition: 'background-color 0.3s',
          width: '100%',
          maxWidth: '300px',
        }}
      >
        {isGenerating ? 'Generating...' : 'Generate All Missing Thumbnails'}
      </button>
      
      {isGenerating && (
        <div style={{ marginTop: '1rem', width: '100%', maxWidth: '300px' }}>
          <div style={{ 
            width: '100%', 
            height: '20px', 
            backgroundColor: '#e0e0e0', 
            borderRadius: '10px',
            overflow: 'hidden',
          }}>
            <div style={{ 
              width: `${(progress.current / progress.total) * 100}%`, 
              height: '100%', 
              backgroundColor: '#D4AF37',
              transition: 'width 0.3s',
            }} />
          </div>
          <p style={{ textAlign: 'center', margin: '0.5rem 0', color: '#8b7355' }}>
            {progress.current} of {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
          </p>
        </div>
      )}
      
      {(successCount > 0 || failureCount > 0 || skippedCount > 0) && !isGenerating && (
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <p style={{ margin: '0.5rem 0', color: '#4CAF50' }}>
            Successfully generated: {successCount}
          </p>
          {failureCount > 0 && (
            <p style={{ margin: '0.5rem 0', color: '#F44336' }}>
              Failed to generate: {failureCount}
            </p>
          )}
          {skippedCount > 0 && (
            <p style={{ margin: '0.5rem 0', color: '#FF9800' }}>
              Skipped: {skippedCount}
            </p>
          )}
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#666' }}>
            {consecutiveFailures > 0 ? 
              `${consecutiveFailures} consecutive failures detected` : 
              'No consecutive failures'}
          </p>
        </div>
      )}
      
      {error && (
        <div style={{ 
          marginTop: '1rem', 
          padding: '0.75rem', 
          backgroundColor: '#ffebee', 
          borderRadius: '5px',
          color: '#d32f2f',
          width: '100%',
          maxWidth: '300px',
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}
    </div>
  );
} 