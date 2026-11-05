import {it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {xlsxResponse} from '../src/modules/exports';
it('exports user text as data in rows and context, preserving exact decimal strings',async()=>{
 const values=['=SUM(A1:A2)',' +CMD','@texto','-123','Texto','1000000000000.12345678'];
 const response=await xlsxResponse('Prueba',['Dato'],values.map(v=>[v]),{'Filtro':'=CMD()'});
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
 expect(book.worksheets[0].getCell('A2').value).toBe("'=SUM(A1:A2)");
 expect(book.worksheets[0].getCell('A3').value).toBe("' +CMD");
 expect(book.worksheets[0].getCell('A4').value).toBe("'@texto");
 expect(book.worksheets[0].getCell('A5').value).toBe("'-123");
 expect(book.worksheets[0].getCell('A7').value).toBe(values[5]);
 expect(book.getWorksheet('Contexto')!.getCell('B2').value).toBe("'=CMD()");
 for(const sheet of book.worksheets)sheet.eachRow(row=>row.eachCell(cell=>expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)));
});
