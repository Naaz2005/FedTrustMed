import React from 'react';
import { X } from 'lucide-react';

interface RecordPdfModalProps {
  /** URL of the PDF to display */
  pdfUrl: string;
  /** Callback to close the modal */
  onClose: () => void;
}

/**
 * Simple full‑screen modal that shows a PDF document in an iframe.
 * Uses Tailwind CSS classes consistent with the rest of the UI.
 */
const RecordPdfModal: React.FC<RecordPdfModalProps> = ({ pdfUrl, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-11/12 h-5/6 bg-slate-900 rounded-lg shadow-lg overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300"
          title="Close PDF"
        >
          <X className="w-5 h-5" />
        </button>
        {/* PDF iframe */}
        <iframe
          src={pdfUrl}
          className="w-full h-full"
          title="Medical Record PDF"
        />
      </div>
    </div>
  );
};

export default RecordPdfModal;

