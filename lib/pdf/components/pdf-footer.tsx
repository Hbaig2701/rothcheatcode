/**
 * PDF Footer Component
 * Fixed footer with disclaimer and page numbers on every page
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';

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
    marginBottom: 8,
  },
  disclaimer: {
    fontSize: 7,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 5,
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

export function PDFFooter() {
  return (
    <View style={footerStyles.container} fixed>
      <View style={footerStyles.divider} />
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
