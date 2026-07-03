package com.scar.api.service;

import com.scar.api.dto.WeeklyPlanDto;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.DefaultIndexedColorMap;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

@Service
public class WeeklyPlanExcelService {

    private static final DateTimeFormatter DATE_FMT =
        DateTimeFormatter.ofPattern("d 'de' MMMM yyyy", new Locale("es", "ES"));
    private static final String[] HEADERS = {
        "#", "ID", "Proyecto", "Tarea", "Miembros", "Inicio", "Fin", "Prioridad", "Tipo", "Observaciones"
    };
    /** Anchos en caracteres, similares a la plantilla Sprint_GAMP_v2 */
    private static final int[] COLUMN_WIDTHS = {4, 12, 18, 38, 42, 11, 11, 11, 16, 32};

    public byte[] export(WeeklyPlanDto plan) {
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Sprint_GAMP_v2");

            Styles styles = new Styles(workbook);
            int rowIdx = 0;

            Row titleRow = sheet.createRow(rowIdx++);
            titleRow.setHeightInPoints(28);
            Cell titleCell = titleRow.createCell(0);
            titleCell.setCellValue(
                "PLANIFICACION SEMANAL PARA CADA TAREA PROGRAMADA Y ACCIONES EFECTUADAS PARA EL CUMPLIMIENTO"
            );
            titleCell.setCellStyle(styles.title);
            sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, HEADERS.length - 1));

            Row weekRow = sheet.createRow(rowIdx++);
            weekRow.setHeightInPoints(18);
            Cell weekCell = weekRow.createCell(0);
            LocalDate start = LocalDate.parse(plan.weekStart());
            LocalDate end = LocalDate.parse(plan.weekEnd());
            weekCell.setCellValue("Semana del " + start.format(DATE_FMT) + " al " + end.format(DATE_FMT));
            weekCell.setCellStyle(styles.subtitle);
            sheet.addMergedRegion(new CellRangeAddress(1, 1, 0, HEADERS.length - 1));

            Row headerRow = sheet.createRow(rowIdx++);
            headerRow.setHeightInPoints(22);
            for (int c = 0; c < HEADERS.length; c++) {
                Cell cell = headerRow.createCell(c);
                cell.setCellValue(HEADERS[c]);
                cell.setCellStyle(styles.header);
            }

            int totalDataRows = 0;
            for (WeeklyPlanDto.WeeklyPlanGroupDto group : plan.groups()) {
                if (plan.groupedByProject()) {
                    Row sectionRow = sheet.createRow(rowIdx++);
                    sectionRow.setHeightInPoints(20);
                    Cell sectionCell = sectionRow.createCell(0);
                    sectionCell.setCellValue(group.projectName().toUpperCase(Locale.ROOT));
                    sectionCell.setCellStyle(styles.section);
                    sheet.addMergedRegion(new CellRangeAddress(sectionRow.getRowNum(), sectionRow.getRowNum(), 0, HEADERS.length - 1));
                }

                for (WeeklyPlanDto.WeeklyPlanRowDto row : group.rows()) {
                    Row dataRow = sheet.createRow(rowIdx++);
                    dataRow.setHeightInPoints(estimateRowHeight(row.members(), row.observations()));
                    totalDataRows++;

                    setCell(dataRow, 0, row.index(), styles.center);
                    setCell(dataRow, 1, row.issueKey(), styles.center);
                    setCell(dataRow, 2, row.projectName(), styles.center);
                    setCell(dataRow, 3, row.title(), styles.text);
                    setCell(dataRow, 4, row.members(), styles.text);
                    setCell(dataRow, 5, row.startDay(), styles.center);
                    setCell(dataRow, 6, row.endDay(), styles.center);
                    setCell(dataRow, 7, row.priority(), styles.center);
                    setCell(dataRow, 8, row.issueType(), styles.center);
                    setCell(dataRow, 9, row.observations(), styles.text);
                }
            }

            int minDataRows = 24;
            while (totalDataRows < minDataRows) {
                Row emptyRow = sheet.createRow(rowIdx++);
                emptyRow.setHeightInPoints(18);
                totalDataRows++;
                for (int c = 0; c < HEADERS.length; c++) {
                    Cell cell = emptyRow.createCell(c);
                    cell.setCellStyle(c == 3 || c == 4 || c == 9 ? styles.text : styles.center);
                }
            }

            rowIdx++;
            Row noteRow = sheet.createRow(rowIdx++);
            noteRow.setHeightInPoints(18);
            Cell noteCell = noteRow.createCell(0);
            noteCell.setCellValue("** Las entregas sobre software a desarrollar son de trabajos parciales");
            noteCell.setCellStyle(styles.note);
            sheet.addMergedRegion(new CellRangeAddress(noteRow.getRowNum(), noteRow.getRowNum(), 0, HEADERS.length - 1));

            rowIdx += 2;
            Row signTitleRow = sheet.createRow(rowIdx++);
            signTitleRow.setHeightInPoints(20);
            Cell signTitle = signTitleRow.createCell(0);
            signTitle.setCellValue("FIRMAS DE LOS RESPONSABLES");
            signTitle.setCellStyle(styles.signatureTitle);
            sheet.addMergedRegion(new CellRangeAddress(signTitleRow.getRowNum(), signTitleRow.getRowNum(), 0, HEADERS.length - 1));

            for (int i = 0; i < 3; i++) {
                Row signLineRow = sheet.createRow(rowIdx++);
                signLineRow.setHeightInPoints(36);
                Cell signLine = signLineRow.createCell(0);
                signLine.setCellStyle(styles.signatureLine);
                sheet.addMergedRegion(new CellRangeAddress(signLineRow.getRowNum(), signLineRow.getRowNum(), 0, HEADERS.length - 1));
            }

            for (int c = 0; c < HEADERS.length; c++) {
                sheet.setColumnWidth(c, COLUMN_WIDTHS[c] * 256);
            }

            sheet.createFreezePane(0, 3);
            sheet.setDisplayGridlines(true);
            sheet.setPrintGridlines(false);

            PrintSetup printSetup = sheet.getPrintSetup();
            printSetup.setLandscape(true);
            printSetup.setFitWidth((short) 1);
            printSetup.setFitHeight((short) 0);
            sheet.setFitToPage(true);
            sheet.setAutobreaks(true);

            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo generar el Excel del plan semanal", e);
        }
    }

    public String fileName(LocalDate weekStart) {
        return "Sprint_Programacion_" + weekStart + ".xlsx";
    }

    private static void setCell(Row row, int col, Object value, CellStyle style) {
        Cell cell = row.createCell(col);
        if (value instanceof Number n) {
            cell.setCellValue(n.doubleValue());
        } else {
            cell.setCellValue(value != null ? value.toString() : "");
        }
        cell.setCellStyle(style);
    }

    private static float estimateRowHeight(String members, String observations) {
        int lines = 1;
        lines = Math.max(lines, lineCount(members));
        lines = Math.max(lines, lineCount(observations));
        return Math.min(72, 18 + (lines - 1) * 14f);
    }

    private static int lineCount(String text) {
        if (text == null || text.isBlank()) return 1;
        return Math.max(1, (int) Math.ceil(text.length() / 42.0));
    }

    private static final class Styles {
        final CellStyle title;
        final CellStyle subtitle;
        final CellStyle header;
        final CellStyle section;
        final CellStyle center;
        final CellStyle text;
        final CellStyle note;
        final CellStyle signatureTitle;
        final CellStyle signatureLine;

        Styles(XSSFWorkbook workbook) {
            Font titleFont = font(workbook, true, (short) 12);
            Font subtitleFont = font(workbook, false, (short) 10);
            Font headerFont = font(workbook, true, (short) 10);
            Font sectionFont = font(workbook, true, (short) 11);
            Font bodyFont = font(workbook, false, (short) 10);
            Font noteFont = font(workbook, true, (short) 10);
            Font signFont = font(workbook, true, (short) 11);

            XSSFColor headerGrey = new XSSFColor(new byte[]{(byte) 217, (byte) 217, (byte) 217}, new DefaultIndexedColorMap());
            XSSFColor sectionGrey = new XSSFColor(new byte[]{(byte) 242, (byte) 242, (byte) 242}, new DefaultIndexedColorMap());

            title = bordered(workbook, titleFont, HorizontalAlignment.CENTER, VerticalAlignment.CENTER, null);
            title.setWrapText(true);

            subtitle = bordered(workbook, subtitleFont, HorizontalAlignment.CENTER, VerticalAlignment.CENTER, null);

            header = bordered(workbook, headerFont, HorizontalAlignment.CENTER, VerticalAlignment.CENTER, headerGrey);
            header.setWrapText(true);

            section = bordered(workbook, sectionFont, HorizontalAlignment.LEFT, VerticalAlignment.CENTER, sectionGrey);
            section.setWrapText(true);

            center = bordered(workbook, bodyFont, HorizontalAlignment.CENTER, VerticalAlignment.CENTER, null);
            center.setWrapText(true);

            text = bordered(workbook, bodyFont, HorizontalAlignment.LEFT, VerticalAlignment.TOP, null);
            text.setWrapText(true);

            note = workbook.createCellStyle();
            note.setFont(noteFont);
            note.setAlignment(HorizontalAlignment.LEFT);
            note.setVerticalAlignment(VerticalAlignment.CENTER);

            signatureTitle = workbook.createCellStyle();
            signatureTitle.setFont(signFont);
            signatureTitle.setAlignment(HorizontalAlignment.CENTER);
            signatureTitle.setVerticalAlignment(VerticalAlignment.CENTER);

            signatureLine = workbook.createCellStyle();
            signatureLine.setFont(bodyFont);
            signatureLine.setBorderBottom(BorderStyle.THIN);
            signatureLine.setVerticalAlignment(VerticalAlignment.BOTTOM);
        }

        private static Font font(Workbook workbook, boolean bold, short size) {
            Font font = workbook.createFont();
            font.setFontName("Calibri");
            font.setBold(bold);
            font.setFontHeightInPoints(size);
            return font;
        }

        private static XSSFCellStyle bordered(
            XSSFWorkbook workbook,
            Font font,
            HorizontalAlignment hAlign,
            VerticalAlignment vAlign,
            XSSFColor fill
        ) {
            XSSFCellStyle style = workbook.createCellStyle();
            style.setFont(font);
            style.setAlignment(hAlign);
            style.setVerticalAlignment(vAlign);
            style.setBorderBottom(BorderStyle.THIN);
            style.setBorderTop(BorderStyle.THIN);
            style.setBorderLeft(BorderStyle.THIN);
            style.setBorderRight(BorderStyle.THIN);
            if (fill != null) {
                style.setFillForegroundColor(fill);
                style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            }
            return style;
        }
    }
}
