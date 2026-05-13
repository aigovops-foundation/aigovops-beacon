import React from "react";

const STEPS = [
  { num: 1, label: "What network" },
  { num: 2, label: "What's running" },
  { num: 3, label: "What matters" },
  { num: 4, label: "Pick guardrails" },
  { num: 5, label: "Your audit" },
];

export default function Stepper({ current }) {
  return (
    <ol className="stepper" aria-label="Studio progress">
      {STEPS.map((s) => {
        const status =
          s.num < current ? "done" : s.num === current ? "active" : "";
        return (
          <li key={s.num} className={`step ${status}`}>
            <span className="num">{s.num}</span>
            <span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
