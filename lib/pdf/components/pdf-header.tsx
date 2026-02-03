/**
 * PDF Header Component
 * Displays logo/branding, report title, client name, and generation date
 */

import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { PDFBranding } from '../types';

interface PDFHeaderProps {
  clientName: string;
  generatedAt: string;
  branding?: PDFBranding;
}

export function PDFHeader({ clientName, generatedAt, branding }: PDFHeaderProps) {
  const primaryColor = branding?.primaryColor || '#1e3a5f';
  const secondaryColor = branding?.secondaryColor || '#14b8a6';

  // Format the date for display
  const formattedDate = new Date(generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const dynamicStyles = StyleSheet.create({
    container: {
      marginBottom: 20,
      borderBottomWidth: 2,
      borderBottomColor: secondaryColor,
      paddingBottom: 15,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    logo: {
      maxWidth: 160,
      maxHeight: 40,
      objectFit: 'contain',
    },
    companyName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: primaryColor,
    },
    tagline: {
      fontSize: 9,
      color: '#6b7280',
      marginTop: 2,
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 4,
      color: primaryColor,
    },
    preparedFor: {
      fontSize: 9,
      color: '#6b7280',
      marginBottom: 2,
    },
    clientName: {
      fontSize: 14,
      fontWeight: 'bold',
      marginBottom: 6,
      color: '#111827',
    },
    generatedAt: {
      fontSize: 9,
      color: '#6b7280',
    },
  });

  return (
    <View style={dynamicStyles.container}>
      {/* Logo or Company Name */}
      {(branding?.logoUrl || branding?.companyName) && (
        <View style={dynamicStyles.logoRow}>
          {branding.logoUrl ? (
            <Image src={branding.logoUrl} style={dynamicStyles.logo} />
          ) : branding.companyName ? (
            <View>
              <Text style={dynamicStyles.companyName}>{branding.companyName}</Text>
              {branding.tagline && (
                <Text style={dynamicStyles.tagline}>{branding.tagline}</Text>
              )}
            </View>
          ) : null}
        </View>
      )}

      <Text style={dynamicStyles.title}>Roth Conversion Analysis Report</Text>
      <Text style={dynamicStyles.preparedFor}>Prepared for:</Text>
      <Text style={dynamicStyles.clientName}>{clientName}</Text>
      <Text style={dynamicStyles.generatedAt}>Generated: {formattedDate}</Text>
    </View>
  );
}
