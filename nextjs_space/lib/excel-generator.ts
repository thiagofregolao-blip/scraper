import * as XLSX from 'xlsx';

export function generateExcelBuffer(
  products: any[],
  categoryName: string
): Buffer {
  try {
    const worksheet = XLSX.utils.json_to_sheet(products);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    console.log(`[Excel] Buffer gerado com sucesso (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    console.error(`[Excel] Erro ao gerar buffer: ${error}`);
    throw error;
  }
}
