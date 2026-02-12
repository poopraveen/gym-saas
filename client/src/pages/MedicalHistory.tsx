import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { api, getApiErrorMessage, storage } from '../api/client';
import './MedicalHistory.css';

type MedicalHistoryModel = {
  bloodGroup?: string;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  injuries?: string[];
  notes?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  updatedAt?: string;
};

function splitCsv(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinCsv(arr: string[] | undefined): string {
  return (arr || []).join(', ');
}

export default function MedicalHistory() {
  const navigate = useNavigate();
  const isMember = storage.getRole() === 'MEMBER';

  const [activeNav, setActiveNav] = useState<'nutrition-ai' | 'medical-history'>('medical-history');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<MedicalHistoryModel>({
    bloodGroup: '',
    allergies: [],
    conditions: [],
    medications: [],
    injuries: [],
    notes: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  const [allergiesText, setAllergiesText] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [medicationsText, setMedicationsText] = useState('');
  const [injuriesText, setInjuriesText] = useState('');

  type DocListItem = { _id: string; originalName: string; label?: string; mimeType?: string; size?: number; uploadedAt: string };
  const [documents, setDocuments] = useState<DocListItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DocListItem | null>(null);
  const [viewedDocContent, setViewedDocContent] = useState<{ url: string; originalName: string; label?: string; mimeType?: string } | null>(null);
  const [viewDocError, setViewDocError] = useState('');
  const [viewDocLoading, setViewDocLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bloodGroups = useMemo(
    () => ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    [],
  );

  useEffect(() => {
    if (!isMember) return;
    setLoading(true);
    setError('');
    api.medicalHistory
      .getMine()
      .then((d) => {
        const doc = d || {};
        setForm({
          bloodGroup: (doc.bloodGroup as string) || '',
          allergies: (doc.allergies as string[]) || [],
          conditions: (doc.conditions as string[]) || [],
          medications: (doc.medications as string[]) || [],
          injuries: (doc.injuries as string[]) || [],
          notes: (doc.notes as string) || '',
          emergencyContactName: (doc.emergencyContactName as string) || '',
          emergencyContactPhone: (doc.emergencyContactPhone as string) || '',
          updatedAt: doc.updatedAt as string | undefined,
        });
        setAllergiesText(joinCsv(doc.allergies as string[] | undefined));
        setConditionsText(joinCsv(doc.conditions as string[] | undefined));
        setMedicationsText(joinCsv(doc.medications as string[] | undefined));
        setInjuriesText(joinCsv(doc.injuries as string[] | undefined));
      })
      .catch((e) => setError(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [isMember]);

  const loadDocuments = () => {
    if (!isMember) return;
    setDocumentsLoading(true);
    api.medicalHistory
      .listDocuments()
      .then((list) => setDocuments(Array.isArray(list) ? list : []))
      .catch(() => setDocuments([]))
      .finally(() => setDocumentsLoading(false));
  };

  useEffect(() => {
    if (!isMember) return;
    loadDocuments();
  }, [isMember]);

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadError('Please select a photo or document.');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      await api.medicalHistory.uploadDocument(uploadFile, uploadLabel.trim() || undefined);
      setUploadFile(null);
      setUploadLabel('');
      if (document.getElementById('mh-file-input')) (document.getElementById('mh-file-input') as HTMLInputElement).value = '';
      loadDocuments();
    } catch (e) {
      setUploadError(getApiErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const shortId = (id: string) => (id.length > 8 ? id.slice(-8) : id);

  const isImage = (mime?: string) => mime && mime.startsWith('image/');
  const isPdf = (mime?: string) => mime === 'application/pdf';

  const handleViewDocument = (doc: DocListItem) => {
    setViewingDoc(doc);
    setViewedDocContent(null);
    setViewDocError('');
    setViewDocLoading(true);
    api.medicalHistory
      .getDocument(doc._id)
      .then((data) => {
        setViewedDocContent(data);
        setViewDocError('');
      })
      .catch((e) => {
        setViewDocError(getApiErrorMessage(e) || 'You do not have access to this document.');
        setViewedDocContent(null);
      })
      .finally(() => setViewDocLoading(false));
  };

  const closeViewModal = () => {
    setViewingDoc(null);
    setViewedDocContent(null);
    setViewDocError('');
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm('Delete this medical record? This cannot be undone.')) return;
    setDeletingId(docId);
    setUploadError('');
    try {
      await api.medicalHistory.deleteDocument(docId);
      loadDocuments();
    } catch (e) {
      setUploadError(getApiErrorMessage(e));
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  const handleNavChange = (id: string) => {
    if (id === 'nutrition-ai') {
      setActiveNav('nutrition-ai');
      navigate('/nutrition-ai');
      return;
    }
    if (id === 'medical-history') {
      setActiveNav('medical-history');
      navigate('/medical-history');
      return;
    }
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const payload = {
        bloodGroup: form.bloodGroup?.trim() || undefined,
        allergies: splitCsv(allergiesText),
        conditions: splitCsv(conditionsText),
        medications: splitCsv(medicationsText),
        injuries: splitCsv(injuriesText),
        notes: form.notes?.trim() || undefined,
        emergencyContactName: form.emergencyContactName?.trim() || undefined,
        emergencyContactPhone: form.emergencyContactPhone?.trim() || undefined,
      };
      const saved = (await api.medicalHistory.saveMine(payload)) as MedicalHistoryModel | null;
      if (saved) setForm((p) => ({ ...p, updatedAt: saved.updatedAt }));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!isMember) {
    return (
      <Layout activeNav="nutrition-ai" onNavChange={handleNavChange} onLogout={handleLogout}>
        <div className="medical-history-page">
          <h1 className="page-title">Medical History</h1>
          <div className="mh-card">
            <p className="mh-hint">Medical history is available for member accounts only.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout activeNav={activeNav as any} onNavChange={handleNavChange} onLogout={handleLogout}>
      <div className="medical-history-page">
        <h1 className="page-title">Medical History</h1>
        <p className="mh-hint">
          Add important health details (allergies, conditions, medications). This helps trainers/guidance. You can update anytime.
        </p>

        <div className="mh-card">
          {error && <div className="mh-error">{error}</div>}
          {loading ? (
            <div className="mh-hint">Loading…</div>
          ) : (
            <>
              <div className="mh-grid">
                <div className="mh-row">
                  <select
                    value={form.bloodGroup || ''}
                    onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value || '' }))}
                  >
                    {bloodGroups.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg || 'Blood group (optional)'}
                      </option>
                    ))}
                  </select>
                  <input
                    value={form.emergencyContactPhone || ''}
                    placeholder="Emergency contact phone"
                    onChange={(e) => setForm((p) => ({ ...p, emergencyContactPhone: e.target.value }))}
                  />
                </div>

                <input
                  value={form.emergencyContactName || ''}
                  placeholder="Emergency contact name"
                  onChange={(e) => setForm((p) => ({ ...p, emergencyContactName: e.target.value }))}
                />

                <input
                  value={allergiesText}
                  placeholder="Allergies (comma separated) e.g. peanuts, lactose"
                  onChange={(e) => setAllergiesText(e.target.value)}
                />
                <input
                  value={conditionsText}
                  placeholder="Conditions (comma separated) e.g. asthma, diabetes"
                  onChange={(e) => setConditionsText(e.target.value)}
                />
                <input
                  value={medicationsText}
                  placeholder="Medications (comma separated) e.g. metformin"
                  onChange={(e) => setMedicationsText(e.target.value)}
                />
                <input
                  value={injuriesText}
                  placeholder="Injuries (comma separated) e.g. knee pain"
                  onChange={(e) => setInjuriesText(e.target.value)}
                />
                <textarea
                  value={form.notes || ''}
                  placeholder="Notes (optional) e.g. doctor advice, surgery history"
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>

              <div className="mh-actions">
                <button type="button" className="btn-secondary" onClick={() => navigate('/nutrition-ai')} disabled={saving}>
                  Back
                </button>
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save medical history'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mh-card mh-docs-card">
          <h2 className="mh-docs-title">Medical records (photos & documents)</h2>
          <p className="mh-hint">
            Upload lab reports, prescriptions, or photos for future reference. You can name each record (e.g. &quot;Blood test March 2024&quot;). Document upload is available on the Premium plan. Maximum 5 records per user.
          </p>
          <p className={`mh-docs-limit ${documents.length >= 5 ? 'mh-docs-limit-max' : ''}`}>
            You have {documents.length}/5 records.
            {documents.length >= 5 && ' Delete one to upload a new record.'}
          </p>
          <div className="mh-upload-row">
            <input
              id="mh-file-input"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              className="mh-file-input"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              disabled={documents.length >= 5}
            />
            <input
              type="text"
              className="mh-label-input"
              placeholder="Name for this record (optional)"
              value={uploadLabel}
              onChange={(e) => setUploadLabel(e.target.value)}
              disabled={documents.length >= 5}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={handleUpload}
              disabled={uploading || !uploadFile || documents.length >= 5}
            >
              {uploading ? 'Uploading…' : documents.length >= 5 ? 'Max 5 records' : 'Upload'}
            </button>
          </div>
          {uploadError && <div className="mh-error">{uploadError}</div>}
          <p className="mh-hint mh-upload-hint">Images: JPEG, PNG, GIF, WebP. Documents: PDF. Max 10 MB.</p>

          <div className="mh-docs-list-section">
            <h3 className="mh-docs-list-title">Your medical records</h3>
            <p className="mh-hint">Records are stored by ID and name. Click View to open and download from Cloudinary.</p>
            {documentsLoading ? (
              <p className="mh-hint">Loading…</p>
            ) : documents.length === 0 ? (
              <p className="mh-hint">No records yet. Upload a photo or document above to maintain your medical records for future use.</p>
            ) : (
              <div className="mh-docs-table-wrap">
                <table className="mh-docs-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Record ID</th>
                      <th>Name</th>
                      <th>File name</th>
                      <th>Date</th>
                      <th>Size</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc, index) => (
                      <tr key={doc._id}>
                        <td>{index + 1}</td>
                        <td className="mh-td-id">{shortId(doc._id)}</td>
                        <td className="mh-td-name">{doc.label || doc.originalName}</td>
                        <td className="mh-td-filename">{doc.originalName}</td>
                        <td>{formatDate(doc.uploadedAt)}</td>
                        <td>{formatSize(doc.size) || '—'}</td>
                        <td>
                          <div className="mh-doc-actions">
                            <button
                              type="button"
                              className="btn-secondary mh-doc-btn"
                              onClick={() => handleViewDocument(doc)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="mh-doc-btn mh-doc-btn-delete"
                              onClick={() => handleDeleteDocument(doc._id)}
                              disabled={deletingId === doc._id}
                              title="Delete this record"
                            >
                              {deletingId === doc._id ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {viewingDoc && (
          <div className="mh-view-modal-overlay" onClick={closeViewModal} aria-hidden>
            <div className="mh-view-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mh-view-modal-header">
                <h3 className="mh-view-modal-title">{viewingDoc.label || viewingDoc.originalName}</h3>
                <button type="button" className="mh-view-modal-close" onClick={closeViewModal} aria-label="Close">
                  ×
                </button>
              </div>
              <div className="mh-view-modal-body">
                {viewDocLoading && <p className="mh-hint">Loading…</p>}
                {viewDocError && (
                  <div className="mh-view-modal-error">
                    <p>{viewDocError}</p>
                    <p className="mh-hint">You can only view your own medical records.</p>
                  </div>
                )}
                {!viewDocLoading && !viewDocError && viewedDocContent && (
                  <>
                    {isImage(viewedDocContent.mimeType) ? (
                      <img src={viewedDocContent.url} alt={viewedDocContent.label || viewedDocContent.originalName} className="mh-view-modal-img" />
                    ) : isPdf(viewedDocContent.mimeType) ? (
                      <iframe title={viewedDocContent.originalName} src={viewedDocContent.url} className="mh-view-modal-iframe" />
                    ) : (
                      <div className="mh-view-modal-fallback">
                        <p>Preview not available. Use Download to save the file.</p>
                        <a href={viewedDocContent.url} download={viewedDocContent.originalName} className="btn-primary">
                          Download
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>
              {!viewDocLoading && viewedDocContent && (
                <div className="mh-view-modal-footer">
                  <a href={viewedDocContent.url} download={viewedDocContent.originalName} className="btn-primary">
                    Download
                  </a>
                  <button type="button" className="btn-secondary" onClick={closeViewModal}>
                    Close
                  </button>
                </div>
              )}
              {viewDocError && (
                <div className="mh-view-modal-footer">
                  <button type="button" className="btn-secondary" onClick={closeViewModal}>
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

