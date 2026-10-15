<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use RuntimeException;
use ZipArchive;

class DailyReportXlsx
{
    public function create(int $hubId, string $date): string
    {
        $hub = DB::table('hubs')->where('id', $hubId)->first();
        if ($hub === null) {
            throw new RuntimeException('Hub tidak ditemukan.');
        }
        $report = DB::table('daily_reports')->where('hub_id', $hubId)->where('report_date', $date)->first();
        if ($report === null) {
            throw new RuntimeException('Laporan belum dibuat.');
        }

        $hubEvents = DB::table('tracking_events as event')
            ->join('shipments as shipment', 'shipment.id', '=', 'event.shipment_id')
            ->leftJoin('tracking_event_time_corrections as correction', 'correction.tracking_event_id', '=', 'event.id')
            ->where('shipment.delivery_hub_id', $hubId)
            ->whereRaw('DATE(COALESCE(correction.corrected_occurred_at, event.occurred_at)) = ?', [$date])
            ->select('event.event_type')
            ->selectRaw('COUNT(*) AS total')
            ->groupBy('event.event_type')
            ->pluck('total', 'event_type');

        $summary = [
            ['LAPORAN HARIAN HUB', $hub->name],
            ['Tanggal', $date],
            ['Dibuat pada', (string) $report->generated_at],
            [],
            ['Indikator', 'Jumlah'],
            ['Shipment tujuan hub dibuat', (int) $report->shipments_created],
            ['Paket tiba dan dipindai', (int) ($hubEvents['ARRIVED_AT_DELIVERY_HUB'] ?? 0)],
            ['Diserahkan ke kurir', (int) ($hubEvents['HANDOVER_TO_COURIER'] ?? 0)],
            ['Paket gagal kembali ke hub', (int) ($hubEvents['FAILED_PARCEL_RETURNED_TO_HUB'] ?? 0)],
            ['Paket terkirim', (int) $report->delivered],
            ['Percobaan gagal', (int) $report->failed_attempts],
            ['Berhasil setelah antar ulang', (int) $report->redelivered],
            ['Permintaan retur', (int) $report->returned_requested],
        ];
        $activities = [['Waktu', 'AWB', 'Peristiwa', 'Status', 'Petugas']];
        $events = DB::table('tracking_events as event')
            ->join('shipments as shipment', 'shipment.id', '=', 'event.shipment_id')
            ->leftJoin('tracking_event_time_corrections as correction', 'correction.tracking_event_id', '=', 'event.id')
            ->leftJoin('users as actor', 'actor.id', '=', 'event.actor_user_id')
            ->where('shipment.delivery_hub_id', $hubId)
            ->whereRaw('DATE(COALESCE(correction.corrected_occurred_at, event.occurred_at)) = ?', [$date])
            ->orderByRaw('COALESCE(correction.corrected_occurred_at, event.occurred_at)')->orderBy('event.id')
            ->get([DB::raw('COALESCE(correction.corrected_occurred_at, event.occurred_at) AS occurred_at'), 'shipment.awb', 'event.event_type', 'event.status_after', 'actor.name as actor_name']);
        foreach ($events as $event) {
            $activities[] = [(string) $event->occurred_at, $event->awb, $event->event_type,
                $event->status_after ?? '', $event->actor_name ?? 'Sistem'];
        }

        $attempts = [['Waktu', 'AWB', 'Percobaan', 'Hasil', 'Alasan gagal', 'Kurir', 'Penerima']];
        $attemptRows = DB::table('delivery_attempts as attempt')
            ->join('shipments as shipment', 'shipment.id', '=', 'attempt.shipment_id')
            ->join('run_shipments as stop', 'stop.id', '=', 'attempt.run_shipment_id')
            ->join('delivery_runs as run', 'run.id', '=', 'stop.run_id')
            ->join('users as courier', 'courier.id', '=', 'run.courier_user_id')
            ->where('shipment.delivery_hub_id', $hubId)
            ->whereDate('attempt.attempted_at', $date)
            ->orderBy('attempt.attempted_at')->orderBy('attempt.id')
            ->get(['attempt.attempted_at', 'shipment.awb', 'attempt.attempt_no', 'attempt.result',
                'attempt.failure_reason', 'courier.name as courier_name', 'attempt.recipient_name']);
        foreach ($attemptRows as $attempt) {
            $attempts[] = [(string) $attempt->attempted_at, $attempt->awb, (int) $attempt->attempt_no,
                $attempt->result, $attempt->failure_reason ?? '', $attempt->courier_name,
                $attempt->recipient_name ?? ''];
        }

        return $this->write([
            'Ringkasan' => $summary,
            'Aktivitas' => $activities,
            'Percobaan' => $attempts,
        ]);
    }

    /** @param array<string, array<int, array<int, int|string>>> $sheets */
    private function write(array $sheets): string
    {
        $path = tempnam(sys_get_temp_dir(), 'satria-report-');
        if ($path === false) {
            throw new RuntimeException('Gagal menyiapkan file laporan.');
        }
        $zip = new ZipArchive;
        if ($zip->open($path, ZipArchive::OVERWRITE) !== true) {
            unlink($path);
            throw new RuntimeException('Gagal membuat file Excel.');
        }

        $overrides = '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
        $relations = '';
        $sheetDefinitions = '';
        $index = 0;
        foreach ($sheets as $name => $rows) {
            $index++;
            $overrides .= '<Override PartName="/xl/worksheets/sheet'.$index.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            $relations .= '<Relationship Id="rId'.$index.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$index.'.xml"/>';
            $sheetDefinitions .= '<sheet name="'.$this->xml($name).'" sheetId="'.$index.'" r:id="rId'.$index.'"/>';
            $zip->addFromString('xl/worksheets/sheet'.$index.'.xml', $this->worksheet($rows));
        }
        $relations .= '<Relationship Id="rId'.($index + 1).'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'.$overrides.'</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            .'</Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<sheets>'.$sheetDefinitions.'</sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$relations.'</Relationships>');
        $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>'
            .'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFE6007E"/><bgColor indexed="64"/></patternFill></fill></fills>'
            .'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            .'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
            .'</styleSheet>');
        $zip->close();

        return $path;
    }

    /** @param array<int, array<int, int|string>> $rows */
    private function worksheet(array $rows): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            .'<sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="24" customWidth="1"/>'
            .'<col min="2" max="2" width="24" customWidth="1"/><col min="3" max="7" width="27" customWidth="1"/></cols><sheetData>';
        foreach ($rows as $rowIndex => $row) {
            $rowNumber = $rowIndex + 1;
            $xml .= '<row r="'.$rowNumber.'">';
            foreach ($row as $columnIndex => $value) {
                $reference = $this->column($columnIndex + 1).$rowNumber;
                $header = ($rowIndex === 0 || ($rowIndex === 4 && $rows[0][0] === 'LAPORAN HARIAN HUB')) ? ' s="1"' : '';
                $xml .= is_int($value)
                    ? '<c r="'.$reference.'" t="n"'.$header.'><v>'.$value.'</v></c>'
                    : '<c r="'.$reference.'" t="inlineStr"'.$header.'><is><t xml:space="preserve">'.$this->xml($value).'</t></is></c>';
            }
            $xml .= '</row>';
        }

        return $xml.'</sheetData></worksheet>';
    }

    private function column(int $index): string
    {
        $name = '';
        while ($index > 0) {
            $index--;
            $name = chr(65 + $index % 26).$name;
            $index = intdiv($index, 26);
        }

        return $name;
    }

    private function xml(string $text): string
    {
        return htmlspecialchars(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $text) ?? '', ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
