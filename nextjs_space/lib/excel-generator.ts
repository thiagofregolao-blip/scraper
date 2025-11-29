import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

export function generateExcel(
  products: any[],
  outputPath: string,
  categoryName: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(products);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  XLSX.writeFile(workbook, outputPath);
  console.log(`[Excel] Arquivo gerado: ${outputPath}`);
}
