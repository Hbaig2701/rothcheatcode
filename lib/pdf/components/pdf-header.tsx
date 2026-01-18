/**
 * PDF Header Component
 * Displays report title, client name, and generation date
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';

interface PDFHeaderProps {
  clientName: string;
  generatedAt: string;
}

const headerStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb', // gray-200
    paddingBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1e3a5f', // Professional navy blue
  },
  clientName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#111827', // gray-900
  },
  generatedAt: {
    fontSize: 9,
    color: '#6b7280', // gray-500
  },
});

export function PDFHeader({ clientName, generatedAt }: PDFHeaderProps) {
  // Format the date for display
  const formattedDate = new Date(generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={headerStyles.container}>
      <Text style={headerStyles.title}>Roth Conversion Analysis Report</Text>
      <Text style={headerStyles.clientName}>{clientName}</Text>
      <Text style={headerStyles.generatedAt}>Generated: {formattedDate}</Text>
    </View>
  );
}
