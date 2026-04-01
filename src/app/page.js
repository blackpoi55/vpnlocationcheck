"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";

const STORAGE_KEY = "vpnip-records";
const DUPLICATE_MODE_KEY = "vpnip-duplicate-mode";

function formatDateTime(value) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildLocationLabel(record) {
  return [record.city, record.region, record.country].filter(Boolean).join(", ");
}

function getDisplayIp(record) {
  return record.ipv4 || record.ipv6 || record.ip || "-";
}

function getDuplicateModeLabel(mode) {
  if (mode === "ipv4") {
    return "IPv4";
  }

  if (mode === "ipv6") {
    return "IPv6";
  }

  return "ทั้งคู่";
}

function findDuplicateRecords(records, candidate, mode) {
  return records.filter((entry) => {
    const sameIpv4 =
      candidate.ipv4 && entry.ipv4 && candidate.ipv4 === entry.ipv4;
    const sameIpv6 =
      candidate.ipv6 && entry.ipv6 && candidate.ipv6 === entry.ipv6;

    if (mode === "ipv4") {
      return sameIpv4;
    }

    if (mode === "ipv6") {
      return sameIpv6;
    }

    return sameIpv4 || sameIpv6;
  });
}

function buildDuplicateHtml(ip, duplicates, mode) {
  const items = duplicates
    .map(
      (entry) => `
        <div style="text-align:left;border:1px solid rgba(148,163,184,.35);border-radius:16px;padding:12px 14px;margin-top:10px;background:#f8fafc;">
          <div style="font-weight:700;color:#0f172a;">IPv4: ${escapeHtml(
            entry.ipv4 || "-"
          )}</div>
          <div style="margin-top:4px;color:#0f172a;">IPv6: ${escapeHtml(
            entry.ipv6 || "-"
          )}</div>
          <div style="margin-top:4px;color:#334155;">${escapeHtml(
            buildLocationLabel(entry) || "ไม่พบ location"
          )}</div>
          <div style="margin-top:4px;color:#475569;">หมายเหตุ: ${escapeHtml(
            entry.note || "-"
          )}</div>
          <div style="margin-top:4px;color:#64748b;">บันทึกเมื่อ ${escapeHtml(
            formatDateTime(entry.savedAt)
          )}</div>
        </div>
      `
    )
    .join("");

  return `
    <div style="text-align:left;color:#334155;">
      <div>${escapeHtml(getDuplicateModeLabel(mode))} ของ <strong>${escapeHtml(
        ip
      )}</strong> ซ้ำกับข้อมูลที่บันทึกไว้แล้ว</div>
      <div style="margin-top:8px;">รายการที่ซ้ำ:</div>
      ${items}
    </div>
  `;
}

async function resolveFromIpApi() {
  const response = await fetch("https://ipapi.co/json/", {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("ipapi.co request failed");
  }

  const payload = await response.json();

  if (!payload.ip) {
    throw new Error("ipapi.co returned an invalid payload");
  }

  return {
    ip: payload.ip,
    city: payload.city || "",
    region: payload.region || "",
    country: payload.country_name || payload.country || "",
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    timezone: payload.timezone || "",
    isp: payload.org || "",
    source: "ipapi.co",
    fetchedAt: new Date().toISOString(),
  };
}

async function resolveFromIpWho() {
  const response = await fetch("https://ipwho.is/", {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("ipwho.is request failed");
  }

  const payload = await response.json();

  if (!payload.success || !payload.ip) {
    throw new Error("ipwho.is returned an invalid payload");
  }

  return {
    ip: payload.ip,
    city: payload.city || "",
    region: payload.region || "",
    country: payload.country || "",
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    timezone: payload.timezone?.id || payload.timezone || "",
    isp: payload.connection?.isp || "",
    source: "ipwho.is",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchCurrentNetwork() {
  const providers = [resolveFromIpApi, resolveFromIpWho];
  const errors = [];

  for (const provider of providers) {
    try {
      return await provider();
    } catch (error) {
      errors.push(error);
    }
  }

  throw new Error(
    errors.at(-1)?.message || "ไม่สามารถดึงข้อมูล IP และ location ได้"
  );
}

async function fetchVersionedIp(url) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return "";
    }

    const payload = await response.json();
    return payload.ip || "";
  } catch {
    return "";
  }
}

async function fetchAllIps() {
  const [ipv4, ipv6] = await Promise.all([
    fetchVersionedIp("https://api4.ipify.org?format=json"),
    fetchVersionedIp("https://api6.ipify.org?format=json"),
  ]);

  return { ipv4, ipv6 };
}

function StatCard({ label, value, accent }) {
  return (
    <div className="panel px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div
        className={`mt-3 text-2xl font-semibold tracking-tight ${
          accent || "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function RecordCard({ entry, onDelete }) {
  return (
    <article className="panel overflow-hidden px-5 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-white">
              IPv4 {entry.ipv4 || "-"}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-white">
              IPv6 {entry.ipv6 || "-"}
            </span>
            <span className="rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-semibold text-cyan-900">
              {buildLocationLabel(entry) || "ไม่พบ location"}
            </span>
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            {entry.note || "ไม่มีหมายเหตุ"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
        >
          ลบ
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
            บันทึกเมื่อ
          </div>
          <div className="mt-2 text-sm font-medium text-slate-700">
            {formatDateTime(entry.savedAt)}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
            เขตเวลา
          </div>
          <div className="mt-2 text-sm font-medium text-slate-700">
            {entry.timezone || "-"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
            พิกัด
          </div>
          <div className="mt-2 text-sm font-medium text-slate-700">
            {entry.latitude ?? "-"}, {entry.longitude ?? "-"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
            IP หลัก
          </div>
          <div className="mt-2 break-all text-sm font-medium text-slate-700">
            {entry.ip || "-"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 sm:col-span-2 xl:col-span-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
            โหมดตรวจซ้ำตอนบันทึก
          </div>
          <div className="mt-2 text-sm font-medium text-slate-700">
            {getDuplicateModeLabel(entry.duplicateMode || "ipv4")}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [currentLookup, setCurrentLookup] = useState(null);
  const [records, setRecords] = useState([]);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [duplicateMode, setDuplicateMode] = useState("ipv4");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      const parsedValue = rawValue ? JSON.parse(rawValue) : [];
      const savedDuplicateMode =
        window.localStorage.getItem(DUPLICATE_MODE_KEY) || "ipv4";

      if (Array.isArray(parsedValue)) {
        setRecords(parsedValue);
      }

      if (["ipv4", "ipv6", "both"].includes(savedDuplicateMode)) {
        setDuplicateMode(savedDuplicateMode);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(DUPLICATE_MODE_KEY);
    } finally {
      setIsReady(true);
    }
  }, []);

  function persistRecords(nextRecords) {
    setRecords(nextRecords);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
  }

  function handleChangeDuplicateMode(mode) {
    setDuplicateMode(mode);
    window.localStorage.setItem(DUPLICATE_MODE_KEY, mode);
  }

  async function handleFetch() {
    setIsLoading(true);

    try {
      const [network, ipVersions] = await Promise.all([
        fetchCurrentNetwork(),
        fetchAllIps(),
      ]);

      const enrichedNetwork = {
        ...network,
        ipv4: ipVersions.ipv4,
        ipv6: ipVersions.ipv6,
      };

      setCurrentLookup(enrichedNetwork);

      const duplicates = findDuplicateRecords(
        records,
        enrichedNetwork,
        duplicateMode
      );

      if (duplicates.length > 0) {
        await Swal.fire({
          icon: "warning",
          title: `พบข้อมูลซ้ำ (${getDuplicateModeLabel(duplicateMode)})`,
          html: buildDuplicateHtml(
            getDisplayIp(enrichedNetwork),
            duplicates,
            duplicateMode
          ),
          confirmButtonText: "ดูแล้ว",
          confirmButtonColor: "#0f172a",
        });
        return;
      }

      await Swal.fire({
        icon: "success",
        title: "ดึงข้อมูลสำเร็จ",
        text: "พร้อมสำหรับการบันทึกแล้ว",
        confirmButtonText: "ตกลง",
        confirmButtonColor: "#0f172a",
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "ดึงข้อมูลไม่สำเร็จ",
        text: error.message || "ลองใหม่อีกครั้ง",
        confirmButtonText: "ปิด",
        confirmButtonColor: "#0f172a",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!currentLookup) {
      await Swal.fire({
        icon: "info",
        title: "ยังไม่มีข้อมูลให้บันทึก",
        text: "กดปุ่มดึงข้อมูลก่อน",
        confirmButtonText: "เข้าใจแล้ว",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    const duplicates = findDuplicateRecords(records, currentLookup, duplicateMode);

    if (duplicates.length > 0) {
      await Swal.fire({
        icon: "warning",
        title: `บันทึกไม่ได้ เพราะข้อมูลซ้ำ (${getDuplicateModeLabel(
          duplicateMode
        )})`,
        html: buildDuplicateHtml(
          getDisplayIp(currentLookup),
          duplicates,
          duplicateMode
        ),
        confirmButtonText: "ตกลง",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    const newRecord = {
      ...currentLookup,
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}`,
      duplicateMode,
      note: note.trim(),
      savedAt: new Date().toISOString(),
    };

    persistRecords([newRecord, ...records]);
    setNote("");

    await Swal.fire({
      icon: "success",
      title: "บันทึกลง localStorage แล้ว",
      text: "บันทึกรายการเรียบร้อย",
      confirmButtonText: "เยี่ยม",
      confirmButtonColor: "#0f172a",
    });
  }

  async function handleDelete(id) {
    const targetRecord = records.find((entry) => entry.id === id);

    if (!targetRecord) {
      return;
    }

    const result = await Swal.fire({
      icon: "question",
      title: "ยืนยันการลบรายการนี้",
      text: `${getDisplayIp(targetRecord)} จะถูกลบออกจาก localStorage`,
      showCancelButton: true,
      confirmButtonText: "ลบเลย",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#be123c",
      cancelButtonColor: "#0f172a",
    });

    if (!result.isConfirmed) {
      return;
    }

    persistRecords(records.filter((entry) => entry.id !== id));

    await Swal.fire({
      icon: "success",
      title: "ลบรายการแล้ว",
      text: `${getDisplayIp(targetRecord)} ถูกลบเรียบร้อย`,
      confirmButtonText: "ปิด",
      confirmButtonColor: "#0f172a",
    });
  }

  const filteredRecords = records.filter((entry) => {
    const searchTarget = [
      entry.ip,
      entry.ipv4,
      entry.ipv6,
      entry.city,
      entry.region,
      entry.country,
      entry.timezone,
      entry.isp,
      entry.note,
      entry.source,
    ]
      .join(" ")
      .toLowerCase();

    return searchTarget.includes(search.trim().toLowerCase());
  });

  const duplicateCount = currentLookup
    ? findDuplicateRecords(records, currentLookup, duplicateMode).length
    : 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[34px] border border-white/60 bg-white/72 px-5 py-5 shadow-[0_32px_120px_-52px_rgba(15,23,42,0.72)] backdrop-blur-xl sm:px-7 sm:py-7">
        <div className="hero-orb absolute -left-10 top-10 h-40 w-40 rounded-full bg-cyan-300/40 blur-3xl" />
        <div className="hero-orb absolute -right-8 bottom-0 h-44 w-44 rounded-full bg-amber-200/45 blur-3xl" />

        <div className="relative grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] bg-slate-950 px-5 py-6 text-white sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-300">
                  IP NOTE
                </div>
                <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                  ข้อมูลเครือข่ายของคุณ
                </h1>
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80">
                {duplicateCount > 0 ? `ซ้ำ ${duplicateCount}` : "ไม่ซ้ำ"}
              </div>
            </div>

            <div className="mt-8 rounded-[24px] border border-white/10 bg-white/6 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                    IPv4
                  </div>
                  <div className="mt-3 break-all font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                    {currentLookup?.ipv4 || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                    IPv6
                  </div>
                  <div className="mt-3 break-all font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                    {currentLookup?.ipv6 || "-"}
                  </div>
                </div>
              </div>
              <div className="mt-5 text-sm text-slate-300">
                {currentLookup
                  ? buildLocationLabel(currentLookup) || "-"
                  : "ยังไม่ได้ดึงข้อมูล"}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleFetch}
                disabled={isLoading}
                className="inline-flex items-center justify-center rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-white"
              >
                {isLoading ? "กำลังดึง..." : "ดึงข้อมูล"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/16"
              >
                บันทึก
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-3">
              <StatCard
                label="รายการ"
                value={isReady ? `${records.length}` : "..."}
                accent="text-cyan-700"
              />
              <StatCard
                label="สถานะ"
                value={currentLookup ? "พร้อมบันทึก" : "รอข้อมูล"}
                accent="text-slate-900"
              />
              <StatCard
                label="โหมดตรวจ"
                value={getDuplicateModeLabel(duplicateMode)}
                accent="text-amber-600"
              />
            </div>

            <div className="panel px-5 py-5 sm:px-6">
              <div className="mb-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  โหมดตรวจซ้ำ
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-[24px] bg-slate-100 p-2">
                  {[
                    { id: "ipv4", label: "IPv4" },
                    { id: "ipv6", label: "IPv6" },
                    { id: "both", label: "ทั้งคู่" },
                  ].map((option) => {
                    const active = duplicateMode === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleChangeDuplicateMode(option.id)}
                        className={`rounded-[18px] px-3 py-3 text-sm font-semibold transition ${
                          active
                            ? "bg-slate-950 text-white shadow-sm"
                            : "bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                    เขตเวลา
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">
                    {currentLookup?.timezone || "-"}
                  </div>
                </div>
                <div className="rounded-[24px] bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                    ISP
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">
                    {currentLookup?.isp || "-"}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  IP หลัก
                </div>
                <div className="mt-2 break-all text-sm font-semibold text-slate-800">
                  {currentLookup?.ip || "-"}
                </div>
              </div>

              <label className="mt-4 block">
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  placeholder="เพิ่มหมายเหตุ..."
                  className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 panel px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950">
            รายการที่บันทึก
          </h2>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหา"
            className="w-full max-w-sm rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
          />
        </div>

        <div className="mt-5 space-y-4">
          {isReady && filteredRecords.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center">
              <p className="font-display text-2xl font-semibold tracking-tight text-slate-900">
                {records.length === 0 ? "ยังไม่มีรายการ" : "ไม่พบข้อมูล"}
              </p>
            </div>
          ) : null}

          {filteredRecords.map((entry) => (
            <RecordCard key={entry.id} entry={entry} onDelete={handleDelete} />
          ))}
        </div>
      </section>
    </main>
  );
}
