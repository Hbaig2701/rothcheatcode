'use client';

import { useEffect, useState } from 'react';
import { FileText, Download, Trash2, Search, Filter, X, Loader2, RefreshCw, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Report {
  id: string;
  client_id: string | null;
  file_name: string;
  file_path: string;
  file_size: number;
  report_type: 'growth' | 'guaranteed_income';
  client_name: string | null;
  title: string | null;
  created_at: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch reports
  useEffect(() => {
    fetchReports();
  }, []);

  // Filter reports when search or filter changes
  useEffect(() => {
    let filtered = reports;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (report) =>
          report.client_name?.toLowerCase().includes(query) ||
          report.title?.toLowerCase().includes(query) ||
          report.file_name.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (reportTypeFilter !== 'all') {
      filtered = filtered.filter((report) => report.report_type === reportTypeFilter);
    }

    setFilteredReports(filtered);
  }, [reports, searchQuery, reportTypeFilter]);

  async function fetchReports() {
    setLoading(true);
    try {
      const response = await fetch('/api/reports');
      if (!response.ok) throw new Error('Failed to fetch reports');

      const data = await response.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
      console.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(report: Report) {
    setDownloadingId(report.id);
    try {
      const response = await fetch(`/api/reports/${report.id}/download`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = report.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Success - no notification needed
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download report. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handlePreview(report: Report) {
    setPreviewLoading(true);
    setPreviewDialogOpen(true);

    try {
      const response = await fetch(`/api/reports/${report.id}/download`);
      if (!response.ok) throw new Error('Failed to load preview');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (error) {
      console.error('Preview error:', error);
      alert('Failed to load preview. Try downloading instead.');
      setPreviewDialogOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleDeleteClick(report: Report) {
    setReportToDelete(report);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!reportToDelete) return;

    setDeleting(true);
    try {
      const response = await fetch('/api/reports', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportToDelete.id }),
      });

      if (!response.ok) throw new Error('Delete failed');

      // Remove from state
      setReports((prev) => prev.filter((r) => r.id !== reportToDelete.id));
      setDeleteDialogOpen(false);
      setReportToDelete(null);

      // Success - no notification needed
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete report. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getReportTypeLabel(type: string): string {
    return type === 'growth' ? 'Growth' : 'Guaranteed Income';
  }

  function getReportTypeBadgeClass(type: string): string {
    return type === 'growth'
      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      : 'bg-green-500/10 text-green-400 border-green-500/20';
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-white">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Report History</h1>
            <p className="text-gray-400">
              View and manage all your generated reports
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchReports}
            disabled={loading}
            className="border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)]"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by title, client name, or file name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-white placeholder:text-gray-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Type Filter */}
            <div className="sm:w-64">
              <Select value={reportTypeFilter} onValueChange={(value) => setReportTypeFilter(value || 'all')}>
                <SelectTrigger className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-white">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="guaranteed_income">Guaranteed Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results count */}
          <div className="mt-3 text-sm text-gray-400">
            Showing {filteredReports.length} of {reports.length} reports
          </div>
        </div>

        {/* Reports List */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="inline-block h-8 w-8 animate-spin text-gold" />
            <p className="mt-4 text-gray-400">Loading reports...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-12 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-lg">
            <FileText className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg mb-2">
              {reports.length === 0
                ? 'No reports yet'
                : 'No reports match your filters'}
            </p>
            <p className="text-gray-500 text-sm mb-4">
              {reports.length === 0
                ? 'Generate your first report to see it here'
                : 'Try adjusting your search or filters'}
            </p>
            {reports.length === 0 && (
              <Button
                onClick={() => window.location.href = '/clients'}
                className="bg-gold hover:bg-gold/90 text-black"
              >
                Go to Clients
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Report Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <FileText className="h-5 w-5 text-gold flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {report.title && (
                          <h3 className="text-white font-semibold truncate mb-0.5">
                            {report.title}
                          </h3>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm ${report.title ? 'text-gray-400' : 'text-white font-medium'}`}>
                            {report.client_name || 'Unknown Client'}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getReportTypeBadgeClass(report.report_type)}`}
                          >
                            {getReportTypeLabel(report.report_type)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
                      <span>{formatDate(report.created_at)}</span>
                      <span>•</span>
                      <span>{formatFileSize(report.file_size)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePreview(report)}
                      className="text-gray-400 hover:text-white hover:bg-[rgba(255,255,255,0.1)]"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(report)}
                      disabled={downloadingId === report.id}
                      className="text-gold hover:text-gold/80 hover:bg-[rgba(212,175,55,0.1)]"
                    >
                      {downloadingId === report.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(report)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-white">
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete this report? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {reportToDelete && (
            <div className="py-4 bg-[rgba(255,255,255,0.03)] rounded-lg px-4">
              {reportToDelete.title && (
                <p className="text-sm text-white font-semibold mb-1">
                  {reportToDelete.title}
                </p>
              )}
              <p className="text-sm text-gray-300 mb-1">
                <strong>{reportToDelete.client_name}</strong>
              </p>
              <p className="text-xs text-gray-500">
                {formatDate(reportToDelete.created_at)} • {formatFileSize(reportToDelete.file_size)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
              className="border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={(open) => {
        setPreviewDialogOpen(open);
        if (!open && previewUrl) {
          window.URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }
      }}>
        <DialogContent className="bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-white max-w-6xl h-[85vh]">
          <DialogHeader>
            <DialogTitle>PDF Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden rounded-lg bg-gray-900">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-gold" />
              </div>
            ) : previewUrl ? (
              <iframe
                src={`${previewUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                className="w-full h-full border-0"
                title="PDF Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                Failed to load preview
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
