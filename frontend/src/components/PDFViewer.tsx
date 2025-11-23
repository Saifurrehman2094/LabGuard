import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import './PDFViewer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFViewerProps {
    examId: string;
    examTitle: string;
    onClose: () => void;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ examId, examTitle, onClose }) => {
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);

    // Check if running in Electron
    const isElectron = () => {
        return !!(window as any).electronAPI;
    };

    // Load PDF data
    React.useEffect(() => {
        loadPDF();
    }, [examId]);

    const loadPDF = async () => {
        try {
            setLoading(true);
            setError(null);

            if (isElectron()) {
                // Get PDF data from Electron backend
                const result = await (window as any).electronAPI.getPDFData(examId);

                if (result.success && result.data) {
                    // Convert base64 to ArrayBuffer
                    const binaryString = atob(result.data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    setPdfData(bytes.buffer);
                } else {
                    setError(result.error || 'Failed to load PDF');
                }
            } else {
                // In web mode, try to fetch from server
                setError('PDF viewing not available in web mode');
            }
        } catch (err) {
            console.error('Error loading PDF:', err);
            setError('Failed to load PDF: ' + (err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setPageNumber(1);
    };

    const onDocumentLoadError = (error: Error) => {
        console.error('Error loading PDF document:', error);
        setError('Failed to load PDF document');
    };

    const goToPrevPage = () => {
        setPageNumber((prev) => Math.max(prev - 1, 1));
    };

    const goToNextPage = () => {
        setPageNumber((prev) => Math.min(prev + 1, numPages));
    };

    const zoomIn = () => {
        setScale((prev) => Math.min(prev + 0.2, 3.0));
    };

    const zoomOut = () => {
        setScale((prev) => Math.max(prev - 0.2, 0.5));
    };

    const resetZoom = () => {
        setScale(1.0);
    };

    return (
        <div className="pdf-viewer-overlay">
            <div className="pdf-viewer-container">
                <div className="pdf-viewer-header">
                    <h2>{examTitle}</h2>
                    <button onClick={onClose} className="close-btn" title="Close PDF Viewer">
                        ✕
                    </button>
                </div>

                {loading && (
                    <div className="pdf-loading">
                        <div className="loading-spinner"></div>
                        <p>Loading PDF...</p>
                    </div>
                )}

                {error && (
                    <div className="pdf-error">
                        <p>⚠️ {error}</p>
                        <button onClick={loadPDF} className="retry-btn">
                            Retry
                        </button>
                    </div>
                )}

                {!loading && !error && pdfData && (
                    <>
                        <div className="pdf-controls">
                            <div className="page-controls">
                                <button
                                    onClick={goToPrevPage}
                                    disabled={pageNumber <= 1}
                                    className="control-btn"
                                    title="Previous Page"
                                >
                                    ◀
                                </button>
                                <span className="page-info">
                                    Page {pageNumber} of {numPages}
                                </span>
                                <button
                                    onClick={goToNextPage}
                                    disabled={pageNumber >= numPages}
                                    className="control-btn"
                                    title="Next Page"
                                >
                                    ▶
                                </button>
                            </div>

                            <div className="zoom-controls">
                                <button onClick={zoomOut} className="control-btn" title="Zoom Out">
                                    −
                                </button>
                                <span className="zoom-info">{Math.round(scale * 100)}%</span>
                                <button onClick={zoomIn} className="control-btn" title="Zoom In">
                                    +
                                </button>
                                <button onClick={resetZoom} className="control-btn" title="Reset Zoom">
                                    Reset
                                </button>
                            </div>
                        </div>

                        <div className="pdf-content">
                            <Document
                                file={{ data: pdfData }}
                                onLoadSuccess={onDocumentLoadSuccess}
                                onLoadError={onDocumentLoadError}
                                loading={<div className="pdf-loading">Loading document...</div>}
                            >
                                <Page
                                    pageNumber={pageNumber}
                                    scale={scale}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                />
                            </Document>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PDFViewer;
