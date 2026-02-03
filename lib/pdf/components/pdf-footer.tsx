/**
 * PDF Footer Component
 * Fixed footer with branding, disclaimer, and page numbers on every page
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import type { PDFBranding } from '../types';

interface PDFFooterProps {
  branding?: PDFBranding;
}

const footerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb', // gray-200
    marginBottom: 6,
  },
  brandingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  companyName: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#444444',
  },
  contactInfo: {
    fontSize: 7,
    color: '#666666',
    textAlign: 'right',
  },
  disclaimer: {
    fontSize: 7,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 1.4,
  },
  pageNumber: {
    fontSize: 8,
    textAlign: 'center',
    color: '#999999',
  },
});

const DISCLAIMER_TEXT =
  'This report is for informational purposes only and does not constitute financial, tax, or legal advice. ' +
  'Consult a qualified professional before making any financial decisions.';

export function PDFFooter({ branding }: PDFFooterProps) {
  const hasContactInfo = branding?.phone || branding?.email || branding?.website;
  const hasCompanyInfo = branding?.companyName || hasContactInfo;

  // Build contact string parts
  const contactParts: string[] = [];
  if (branding?.phone) contactParts.push(branding.phone);
  if (branding?.email) contactParts.push(branding.email);
  const contactLine = contactParts.join(' | ');

  return (
    <View style={footerStyles.container} fixed>
      <View style={footerStyles.divider} />

      {/* Branding row */}
      {hasCompanyInfo && (
        <View style={footerStyles.brandingRow}>
          <Text style={footerStyles.companyName}>
            {branding?.companyName || ''}
          </Text>
          <View>
            {contactLine && (
              <Text style={footerStyles.contactInfo}>{contactLine}</Text>
            )}
            {branding?.website && (
              <Text style={footerStyles.contactInfo}>{branding.website}</Text>
            )}
          </View>
        </View>
      )}

      <Text style={footerStyles.disclaimer}>{DISCLAIMER_TEXT}</Text>
      <Text
        style={footerStyles.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}
