import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

export function generateExcel(
  products: any[],
  outputPath: string,
  categoryName: string
): void {
  try {
    const worksheet = XLSX.utils.json_to_sheet(products);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');
    
    XLSX.writeFile(workbook, outputPath);
    console.log(`[Excel] Arquivo gerado com sucesso: ${outputPath}`);
  } catch (error) {
    console.error(`[Excel] Erro ao gerar arquivo: ${error}`);
    throw error;
  }
}
