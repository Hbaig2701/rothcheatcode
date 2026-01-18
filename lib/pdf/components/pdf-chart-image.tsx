/**
 * PDF Chart Image Component
 * Displays captured chart images or placeholder when unavailable
 */

import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';

interface PDFChartImageProps {
  src: string | null | undefined;
  title: string;
  small?: boolean;
}

const chartStyles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  title: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#111827', // gray-900
  },
  image: {
    width: '100%',
    height: 200,
    objectFit: 'contain',
  },
  imageSmall: {
    width: '100%',
    height: 160,
    objectFit: 'contain',
  },
  placeholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#f3f4f6', // gray-100
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  placeholderText: {
    fontSize: 9,
    color: '#9ca3af', // gray-400
  },
});

export function PDFChartImage({ src, title, small = false }: PDFChartImageProps) {
  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>{title}</Text>
      {src ? (
        <Image
          src={src}
          style={small ? chartStyles.imageSmall : chartStyles.image}
        />
      ) : (
        <View style={chartStyles.placeholder}>
          <Text style={chartStyles.placeholderText}>Chart not available</Text>
        </View>
      )}
    </View>
  );
}
