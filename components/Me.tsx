"use client";
import { useState } from "react";
import type { Strings } from "@/lib/i18n";
import { uid, type AJStore } from "@/lib/store";
import type { Job } from "@/lib/types";

const STATUSES: Job["status"][] = ["saved", "applied", "interview", "offer", "rejected"];

export function Me({ store, s }: { store: AJStore; s: Strings }) {
  const { memories, setMemories, contacts, setContacts, jobs, setJobs } = store;
  const [mem, setMem] = useState("");
  const [c, setC] = useState({ name: "", email: "", phone: "", note: "" });
  const [j, setJ] = useState({ company: "", role: "", link: "" });

  return (
    <div className="panel">
      <section className="card">
        <h2>🧠 {s.memory}</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!mem.trim()) return; setMemories((m) => [...m, { id: uid(), text: mem.trim(), createdAt: new Date().toISOString() }]); setMem(""); }}>
          <input value={mem} onChange={(e) => setMem(e.target.value)} placeholder="e.g. I prefer meetings after 11 AM" />
          <button className="primary">＋</button>
        </form>
        <ul className="list">
          {memories.map((m) => (
            <li key={m.id}><span>{m.text}</span><button className="x" onClick={() => setMemories((all) => all.filter((x) => x.id !== m.id))}>×</button></li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>👥 {s.contacts}</h2>
        <form
          className="grid-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!c.name.trim()) return;
            setContacts((all) => [...all.filter((x) => x.name.toLowerCase() !== c.name.trim().toLowerCase()), { id: uid(), ...c, name: c.name.trim() }]);
            setC({ name: "", email: "", phone: "", note: "" });
          }}
        >
          <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Name" />
          <input value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} placeholder="Email" type="email" />
          <input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="Phone" />
          <input value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} placeholder="Who is this?" />
          <button className="primary">＋</button>
        </form>
        <ul className="list">
          {contacts.map((p) => (
            <li key={p.id}>
              <span><b>{p.name}</b>{p.email && <small> · {p.email}</small>}{p.phone && <small> · {p.phone}</small>}{p.note && <small> · {p.note}</small>}</span>
              <button className="x" onClick={() => setContacts((all) => all.filter((x) => x.id !== p.id))}>×</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>💼 {s.jobs}</h2>
        <form
          className="grid-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!j.company.trim() || !j.role.trim()) return;
            setJobs((all) => [{ id: uid(), company: j.company.trim(), role: j.role.trim(), link: j.link || undefined, status: "saved", updatedAt: new Date().toISOString() }, ...all]);
            setJ({ company: "", role: "", link: "" });
          }}
        >
          <input value={j.company} onChange={(e) => setJ({ ...j, company: e.target.value })} placeholder="Company" />
          <input value={j.role} onChange={(e) => setJ({ ...j, role: e.target.value })} placeholder="Role" />
          <input value={j.link} onChange={(e) => setJ({ ...j, link: e.target.value })} placeholder="Job link" />
          <button className="primary">＋</button>
        </form>
        <ul className="list">
          {jobs.map((x) => (
            <li key={x.id}>
              <span>
                <b>{x.company}</b> · {x.role}
                {x.link && <> · <a href={x.link} target="_blank" rel="noreferrer">link</a></>}
                {x.note && <small> · {x.note}</small>}
              </span>
              <select value={x.status} onChange={(e) => setJobs((all) => all.map((y) => (y.id === x.id ? { ...y, status: e.target.value as Job["status"], updatedAt: new Date().toISOString() } : y)))}>
                {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
              <button className="x" onClick={() => setJobs((all) => all.filter((y) => y.id !== x.id))}>×</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
