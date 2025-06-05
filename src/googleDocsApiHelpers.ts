// src/googleDocsApiHelpers.ts
// Simplified helpers for Google Docs API using official MCP SDK

import { docs_v1 } from 'googleapis';
import { ParagraphStyle, RgbColor, TextStyle } from './types.js';

export async function executeBatchUpdate(
  docs: docs_v1.Docs,
  documentId: string,
  requests: docs_v1.Schema$Request[]
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const response = await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests }
  });
  return response.data;
}

export async function insertText(
  docs: docs_v1.Docs,
  documentId: string,
  text: string,
  index: number
): Promise<void> {
  await executeBatchUpdate(docs, documentId, [{
    insertText: {
      location: { index },
      text
    }
  }]);
}

export async function deleteContentRange(
  docs: docs_v1.Docs,
  documentId: string,
  startIndex: number,
  endIndex: number
): Promise<void> {
  await executeBatchUpdate(docs, documentId, [{
    deleteContentRange: {
      range: {
        startIndex,
        endIndex,
      }
    }
  }]);
}

/**
 * Converts a hex color string to a Google Docs API RgbColor object.
 * @param hex - The hex color string (e.g., "#FF0000", "#F00", "FF0000").
 * @returns A Google Docs API RgbColor object or null if invalid.
 */
export function hexToRgbColor(hex: string): RgbColor | null {
  if (!hex) return null;
  let hexClean = hex.startsWith('#') ? hex.slice(1) : hex;

  // Expand shorthand form (e.g. "F00") to full form (e.g. "FF0000")
  if (hexClean.length === 3) {
    hexClean = hexClean[0] + hexClean[0] + hexClean[1] + hexClean[1] + hexClean[2] + hexClean[2];
  }

  if (hexClean.length !== 6) {
    return null; // Invalid length
  }

  const bigint = parseInt(hexClean, 16);
  if (isNaN(bigint)) {
      return null; // Invalid hex characters
  }

  // Extract RGB values and normalize to 0.0 - 1.0 range
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;

  return { red: r, green: g, blue: b };
}

export function buildTextStyleRequests(
  textStyle: TextStyle,
  range: docs_v1.Schema$Range
): docs_v1.Schema$Request[] {
    const requests: docs_v1.Schema$Request[] = [];
    const gdocsTextStyle: docs_v1.Schema$TextStyle = {};
    const fieldsToUpdate: string[] = [];

    if (textStyle.bold !== undefined) { gdocsTextStyle.bold = textStyle.bold; fieldsToUpdate.push('bold'); }
    if (textStyle.italic !== undefined) { gdocsTextStyle.italic = textStyle.italic; fieldsToUpdate.push('italic'); }
    if (textStyle.underline !== undefined) { gdocsTextStyle.underline = textStyle.underline; fieldsToUpdate.push('underline'); }
    if (textStyle.strikethrough !== undefined) { gdocsTextStyle.strikethrough = textStyle.strikethrough; fieldsToUpdate.push('strikethrough'); }
    if (textStyle.fontSize !== undefined) {
        gdocsTextStyle.fontSize = { magnitude: textStyle.fontSize, unit: 'PT' };
        fieldsToUpdate.push('fontSize');
    }
    if (textStyle.fontFamily !== undefined) {
        gdocsTextStyle.weightedFontFamily = { fontFamily: textStyle.fontFamily };
        fieldsToUpdate.push('weightedFontFamily');
    }
    if (textStyle.foregroundColor !== undefined) {
        const rgbColor = hexToRgbColor(textStyle.foregroundColor);
        if (!rgbColor) throw new Error(`Invalid foreground hex color: ${textStyle.foregroundColor}`);
        gdocsTextStyle.foregroundColor = { color: { rgbColor: rgbColor } };
        fieldsToUpdate.push('foregroundColor');
    }
    if (textStyle.backgroundColor !== undefined) {
        const rgbColor = hexToRgbColor(textStyle.backgroundColor);
        if (!rgbColor) throw new Error(`Invalid background hex color: ${textStyle.backgroundColor}`);
        gdocsTextStyle.backgroundColor = { color: { rgbColor: rgbColor } };
        fieldsToUpdate.push('backgroundColor');
    }
    if (textStyle.linkUrl !== undefined) {
        gdocsTextStyle.link = { url: textStyle.linkUrl };
        fieldsToUpdate.push('link');
    }

    if (fieldsToUpdate.length > 0) {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: gdocsTextStyle,
                fields: fieldsToUpdate.join(','),
            }
        });
    }
    return requests;
}

export function buildParagraphStyleRequests(
  paragraphStyle: ParagraphStyle,
  range: docs_v1.Schema$Range
): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];
  const gdocsParagraphStyle: docs_v1.Schema$ParagraphStyle = {};
  const fieldsToUpdate: string[] = [];

  if (paragraphStyle.alignment) {
    gdocsParagraphStyle.alignment = paragraphStyle.alignment;
    fieldsToUpdate.push('alignment');
  }
  if (paragraphStyle.namedStyleType) {
    gdocsParagraphStyle.namedStyleType = paragraphStyle.namedStyleType;
    fieldsToUpdate.push('namedStyleType');
  }
  
  if (fieldsToUpdate.length > 0) {
    requests.push({
      updateParagraphStyle: {
        range,
        paragraphStyle: gdocsParagraphStyle,
        fields: fieldsToUpdate.join(','),
      },
    });
  }

  return requests;
}
