import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { VoiceProvider } from './hooks/useVoice';

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./index.css"

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary
    FallbackComponent={ErrorFallback}
    onError={(error, errorInfo) => {
      console.error('ErrorBoundary caught error:', error, JSON.stringify(errorInfo, null, 2));
    }}
  >
    <VoiceProvider>
      <App />
    </VoiceProvider>
  </ErrorBoundary>
)
