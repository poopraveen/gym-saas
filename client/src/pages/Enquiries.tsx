import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isValid, parseISO, differenceInDays } from 'date-fns';
import { api, storage } from '../api/client';
import type { EnquiryListItem, EnquiryStatus, EnquiryFollowUpItem } from '../api/client';
import Layout from '../components/Layout';
import WhatsAppButton from '../components/WhatsAppButton';
import AddEnquiryModal from '../components/AddEnquiryModal';
import EnquiryFollowUpModal from '../components/EnquiryFollowUpModal';
import EnquiryDetailModal from '../components/EnquiryDetailModal';
import ConvertToMemberModal from '../components/ConvertToMemberModal';
import { ListSkeleton } from '../components/LoadingSkeleton';
import './Enquiries.css';

const SOURCES = ['Walk-in', 'Phone', 'Website', 'Referral', 'Social Media'] as const;
const STATUSES: EnquiryStatus[] = ['New', 'Follow-up', 'Converted', 'Lost'];

function safeDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = typeof s === 'string' ? parseISO(s) : new Date(s);
  return isValid(d) ? d : null;
}

function getRowHighlight(enquiry: EnquiryListItem): 'overdue' | 'today' | 'normal' | 'converted' {
  if (enquiry.status === 'Converted') return 'converted';
  const expected = safeDate(enquiry.expectedJoinDate);
  const lastFu = safeDate(enquiry.lastFollowUpDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (expected) {
    const expDay = new Date(expected);
    expDay.setHours(0, 0, 0, 0);
    const daysOver = differenceInDays(today, expDay);
    if (daysOver >= 2) return 'overdue';
    if (daysOver >= 0 && daysOver < 2) return 'today';
  }
  if (enquiry.followUpRequired && lastFu) {
    const fuDay = new Date(lastFu);
    fuDay.setHours(0, 0, 0, 0);
    if (differenceInDays(today, fuDay) >= 2) return 'overdue';
    if (differenceInDays(today, fuDay) === 0) return 'today';
  }
  return 'normal';
}

function getBadge(enquiry: EnquiryListItem): string | null {
  if (enquiry.status === 'Converted') return null;
  const h = getRowHighlight(enquiry);
  if (h === 'overdue') return 'Overdue';
  if (h === 'today') return 'Follow-up Today';
  return null;
}

export default function Enquiries() {
  const navigate = useNavigate();
  const [list, setList] = useState<EnquiryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | 'all'>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'today' | 'overdue' | 'new24'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editEnquiry, setEditEnquiry] = useState<EnquiryListItem | null>(null);
  const [detailEnquiry, setDetailEnquiry] = useState<EnquiryListItem | null>(null);
  const [followUpEnquiry, setFollowUpEnquiry] = useState<EnquiryListItem | null>(null);
  const [followUpDefaultType, setFollowUpDefaultType] = useState<'Call' | 'WhatsApp' | 'Visit' | undefined>(undefined);
  const [convertEnquiry, setConvertEnquiry] = useState<EnquiryListItem | null>(null);

  const canConvert = () => {
    const r = storage.getRole();
    return r === 'SUPER_ADMIN' || r === 'TENANT_ADMIN' || r === 'MANAGER';
  };
  const canMarkLost = () => canConvert();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Parameters<typeof api.enquiries.list>[0] = {
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        followUpToday: quickFilter === 'today' ? true : undefined,
        overdue: quickFilter === 'overdue' ? true : undefined,
        newLast24h: quickFilter === 'new24' ? true : undefined,
      };
      const res = await api.enquiries.list(params);
      setList(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load enquiries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (storage.getRole() !== 'SUPER_ADMIN' && !storage.getTenantId()) {
      navigate('/login');
      return;
    }
    load();
  }, [page, limit, statusFilter, quickFilter]);

  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleCreate = async (data: Parameters<typeof api.enquiries.create>[0]) => {
    await api.enquiries.create(data);
    setShowAdd(false);
    load();
  };

  const handleUpdate = async (id: string, data: Parameters<typeof api.enquiries.update>[1]) => {
    await api.enquiries.update(id, data);
    setEditEnquiry(null);
    if (detailEnquiry?._id === id) setDetailEnquiry(null);
    load();
  };

  const handleAddFollowUp = async (
    id: string,
    data: { followUpType: string; notes?: string; nextFollowUpDate?: string },
  ) => {
    await api.enquiries.addFollowUp(id, data);
    setFollowUpEnquiry(null);
    if (detailEnquiry?._id === id) {
      api.enquiries.getOne(id).then(setDetailEnquiry).catch(() => {});
    }
    load();
  };

  const handleMarkLost = async (id: string) => {
    if (!confirm('Mark this enquiry as Lost / Not Interested?')) return;
    await api.enquiries.markLost(id);
    setDetailEnquiry(null);
    setConvertEnquiry(null);
    load();
  };

  const handleMarkAsNew = async (id: string) => {
    await api.enquiries.update(id, { status: 'New' });
    const updated = await api.enquiries.getOne(id);
    setDetailEnquiry(updated);
    load();
  };

  const handleConvert = async (id: string, memberData: Record<string, unknown>) => {
    await api.enquiries.convert(id, memberData);
    setConvertEnquiry(null);
    setDetailEnquiry(null);
    load();
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  const handleNavChange = (id: string) => {
    if (id === 'enquiries') return;
    if (id === 'onboarding') {
      navigate('/onboarding');
      return;
    }
    if (id === 'nutrition-ai') {
      navigate('/nutrition-ai');
      return;
    }
    navigate('/');
  };

  return (
    <Layout activeNav="enquiries" onNavChange={handleNavChange} onLogout={handleLogout}>
      <div className="enquiries-page">
        <div className="enquiries-header">
          <h1 className="page-title">Enquiry Members</h1>
          <button type="button" className="btn-primary" onClick={() => setShowAdd(true)} data-tour="enquiries-add">
            + Add Enquiry
          </button>
        </div>

        <div className="enquiries-toolbar">
          <input
            type="search"
            className="enquiries-search"
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-tour="enquiries-search"
          />
          <div className="enquiries-quick-filters" data-tour="enquiries-quick-filters">
            <button
              type="button"
              className={quickFilter === 'all' ? 'active' : ''}
              onClick={() => setQuickFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={quickFilter === 'today' ? 'active' : ''}
              onClick={() => setQuickFilter('today')}
            >
              Follow-up Today
            </button>
            <button
              type="button"
              className={quickFilter === 'overdue' ? 'active' : ''}
              onClick={() => setQuickFilter('overdue')}
            >
              Overdue
            </button>
            <button
              type="button"
              className={quickFilter === 'new24' ? 'active' : ''}
              onClick={() => setQuickFilter('new24')}
            >
              New (24h)
            </button>
          </div>
          <select
            className="enquiries-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EnquiryStatus | 'all')}
            data-tour="enquiries-status-filter"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {error && <div className="enquiries-error">{error}</div>}

        {loading ? (
          <div className="enquiries-table-wrap">
            <ListSkeleton rows={8} />
          </div>
        ) : list.length === 0 ? (
          <div className="enquiries-empty" data-tour="enquiries-list">No enquiries found. Add your first enquiry.</div>
        ) : (
          <>
            <div className="enquiries-list" data-tour="enquiries-list">
              <div className="enquiries-table-wrap" data-tour="enquiries-table-wrap">
                <table className="enquiries-table">
                  <thead>
                    <tr>
                      <th className="col-name">Name</th>
                      <th className="col-contact">Contact</th>
                      <th className="col-date">Enq. date</th>
                      <th className="col-date">Expected</th>
                      <th className="col-fu">Follow-up</th>
                      <th className="col-status">Status</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row, rowIndex) => {
                      const highlight = getRowHighlight(row);
                      const badge = getBadge(row);
                      const fuText = row.followUpRequired
                        ? (row.lastFollowUpDate ? `Yes · ${format(parseISO(row.lastFollowUpDate), 'dd MMM')}` : 'Yes')
                        : 'No';
                      return (
                        <tr
                          key={row._id}
                          className={`enquiry-row highlight-${highlight}`}
                          onClick={() => setDetailEnquiry(row)}
                          data-tour={rowIndex === 0 ? 'enquiries-first-row' : undefined}
                        >
                          <td className="col-name">
                            <span className="enq-name">{row.name}</span>
                            {(row.email || row.assignedStaff) && (
                              <span className="enq-meta">
                                {row.assignedStaff && ` · ${row.assignedStaff}`}
                                {row.email && ` · ${row.email}`}
                              </span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()} className="col-contact enquiries-phone-cell">
                            <span className="enq-phone">{row.phoneNumber}</span>
                            {row.phoneNumber && (
                              <WhatsAppButton
                                phone={row.phoneNumber}
                                onClick={() => {
                                  setFollowUpEnquiry(row);
                                  setFollowUpDefaultType('WhatsApp');
                                }}
                                title="WhatsApp & add follow-up"
                              />
                            )}
                          </td>
                          <td className="col-date">
                            {row.enquiryDate ? format(parseISO(row.enquiryDate), 'dd MMM yy') : '—'}
                          </td>
                          <td className="col-date">
                            {row.expectedJoinDate ? format(parseISO(row.expectedJoinDate), 'dd MMM yy') : '—'}
                          </td>
                          <td className="col-fu">{fuText}</td>
                          <td className="col-status">
                            <span className={`status-badge status-${row.status}`}>
                              {badge ? `${row.status} (${badge})` : row.status}
                            </span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()} className="col-actions">
                            <div className="enq-actions">
                              <button
                                type="button"
                                className="btn-sm btn-view"
                                onClick={() => setDetailEnquiry(row)}
                                title="View details"
                              >
                                View
                              </button>
                              {row.status !== 'Converted' && row.status !== 'Lost' && (
                                <>
                                  <button type="button" className="btn-sm" onClick={() => setEditEnquiry(row)} title="Edit">Edit</button>
                                  <button
                                    type="button"
                                    className="btn-sm"
                                    onClick={() => { setFollowUpEnquiry(row); setFollowUpDefaultType(undefined); }}
                                    title="Add follow-up"
                                  >
                                    F/U
                                  </button>
                                  {canConvert() && (
                                    <button type="button" className="btn-sm btn-convert" onClick={() => setConvertEnquiry(row)} title="Convert">Convert</button>
                                  )}
                                  {canMarkLost() && (
                                    <button type="button" className="btn-sm btn-lost" onClick={() => handleMarkLost(row._id)} title="Mark lost">Lost</button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="enquiries-cards">
                {list.map((row) => {
                  const highlight = getRowHighlight(row);
                  const badge = getBadge(row);
                  return (
                    <div
                      key={row._id}
                      className={`enquiry-card highlight-${highlight}`}
                      onClick={() => setDetailEnquiry(row)}
                    >
                      <div className="enquiry-card-main">
                        <div className="enquiry-card-head">
                          <span className="enq-card-name">{row.name}</span>
                          <span className={`status-badge status-${row.status}`}>
                            {badge ? `${row.status} (${badge})` : row.status}
                          </span>
                        </div>
                        <div className="enquiry-card-contact" onClick={(e) => e.stopPropagation()}>
                          <span>{row.phoneNumber}</span>
                          {row.phoneNumber && (
                            <WhatsAppButton
                              phone={row.phoneNumber}
                              onClick={() => { setFollowUpEnquiry(row); setFollowUpDefaultType('WhatsApp'); }}
                              title="WhatsApp & follow-up"
                            />
                          )}
                        </div>
                        <div className="enquiry-card-meta">
                          <span>{row.enquiryDate ? format(parseISO(row.enquiryDate), 'dd MMM') : '—'}</span>
                          <span>{row.expectedJoinDate ? `→ ${format(parseISO(row.expectedJoinDate), 'dd MMM')}` : ''}</span>
                          {row.assignedStaff && <span>· {row.assignedStaff}</span>}
                        </div>
                      </div>
                      <div className="enquiry-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn-sm btn-view" onClick={() => setDetailEnquiry(row)}>View</button>
                        {row.status !== 'Converted' && row.status !== 'Lost' && (
                          <>
                            <button type="button" className="btn-sm" onClick={() => setEditEnquiry(row)}>Edit</button>
                            <button type="button" className="btn-sm" onClick={() => { setFollowUpEnquiry(row); setFollowUpDefaultType(undefined); }}>F/U</button>
                            {canConvert() && <button type="button" className="btn-sm btn-convert" onClick={() => setConvertEnquiry(row)}>Convert</button>}
                            {canMarkLost() && <button type="button" className="btn-sm btn-lost" onClick={() => handleMarkLost(row._id)}>Lost</button>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="enquiries-pagination">
              <span className="pagination-info">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
              <div className="pagination-btns">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <AddEnquiryModal
          onClose={() => setShowAdd(false)}
          onSubmit={handleCreate}
          sources={SOURCES}
        />
      )}
      {editEnquiry && (
        <AddEnquiryModal
          enquiry={editEnquiry}
          onClose={() => setEditEnquiry(null)}
          onSubmit={(data) => handleUpdate(editEnquiry._id, data)}
          sources={SOURCES}
        />
      )}
      {detailEnquiry && (
        <EnquiryDetailModal
          enquiry={detailEnquiry}
          onClose={() => setDetailEnquiry(null)}
          onEdit={() => { setDetailEnquiry(null); setEditEnquiry(detailEnquiry); }}
          onFollowUp={() => { setFollowUpEnquiry(detailEnquiry); setFollowUpDefaultType(undefined); }}
          onWhatsAppClick={() => { setFollowUpEnquiry(detailEnquiry); setFollowUpDefaultType('WhatsApp'); }}
          onConvert={canConvert() ? () => setConvertEnquiry(detailEnquiry) : undefined}
          onMarkLost={canMarkLost() ? () => handleMarkLost(detailEnquiry._id) : undefined}
          onMarkAsNew={detailEnquiry.status === 'Lost' ? () => handleMarkAsNew(detailEnquiry._id) : undefined}
        />
      )}
      {followUpEnquiry && (
        <EnquiryFollowUpModal
          enquiry={followUpEnquiry}
          onClose={() => { setFollowUpEnquiry(null); setFollowUpDefaultType(undefined); }}
          onSubmit={(data) => handleAddFollowUp(followUpEnquiry._id, data)}
          defaultFollowUpType={followUpDefaultType}
        />
      )}
      {convertEnquiry && (
        <ConvertToMemberModal
          enquiry={convertEnquiry}
          onClose={() => setConvertEnquiry(null)}
          onSubmit={(data) => handleConvert(convertEnquiry._id, data)}
        />
      )}
    </Layout>
  );
}
