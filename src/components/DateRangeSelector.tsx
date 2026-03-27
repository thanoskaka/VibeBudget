import React, { useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import { DateRange, DateRangeOption } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { formatDate, formatDisplayDate } from "../utils/dateUtils";

interface DateRangeSelectorProps {
  range: DateRange;
  onChange: (range: DateRange) => void;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ range, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const options: { label: string; value: DateRangeOption }[] = [
    { label: "This Month", value: "this-month" },
    { label: "Last Month", value: "last-month" },
    { label: "Last 3 Months", value: "last-3-months" },
    { label: "Last 6 Months", value: "last-6-months" },
    { label: "YTD", value: "ytd" },
    { label: "Last 12 Months", value: "last-12-months" },
    { label: "Custom Range", value: "custom" },
  ];

  const calculateRange = (option: DateRangeOption): DateRange => {
    const now = new Date();
    const today = formatDate(now);
    let start = "";
    let end = today;

    switch (option) {
      case "this-month": {
        start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        break;
      }
      case "last-month": {
        const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        start = formatDate(firstOfLastMonth);
        end = formatDate(lastOfLastMonth);
        break;
      }
      case "last-3-months": {
        // Current month + last 2 months
        start = formatDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
        break;
      }
      case "last-6-months": {
        // Current month + last 5 months
        start = formatDate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
        break;
      }
      case "ytd": {
        start = formatDate(new Date(now.getFullYear(), 0, 1));
        break;
      }
      case "last-12-months": {
        start = formatDate(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
        break;
      }
      case "custom":
        return range; // Keep current range for custom
    }

    return { start, end, option };
  };

  const handleOptionClick = (option: DateRangeOption) => {
    if (option === "custom") {
      setIsOpen(false);
      // We'll handle custom range via inputs in the UI
      onChange({ ...range, option: "custom" });
    } else {
      onChange(calculateRange(option));
      setIsOpen(false);
    }
  };

  const getLabel = () => {
    if (range.option === "custom") {
      return `${formatDisplayDate(range.start)} - ${formatDisplayDate(range.end)}`;
    }
    return options.find(o => o.value === range.option)?.label || "Select Range";
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:border-fintech-accent/50 transition-all"
      >
        <Calendar size={16} className="text-fintech-accent" />
        <span>{getLabel()}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-fintech-card shadow-2xl"
            >
              <div className="p-2 space-y-1">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleOptionClick(opt.value)}
                    className={`w-full rounded-lg px-4 py-2.5 text-left text-sm transition-colors ${
                      range.option === opt.value 
                        ? "bg-fintech-accent/10 text-fintech-accent font-bold" 
                        : "text-fintech-muted hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {range.option === "custom" && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-4 space-y-4 rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-fintech-muted">Custom Range</span>
            <button onClick={() => handleOptionClick("this-month")} className="text-fintech-muted hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-fintech-muted font-bold">Start</label>
              <input
                type="date"
                value={range.start}
                onChange={(e) => onChange({ ...range, start: e.target.value })}
                className="w-full bg-fintech-bg border border-white/10 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-fintech-muted font-bold">End</label>
              <input
                type="date"
                value={range.end}
                onChange={(e) => onChange({ ...range, end: e.target.value })}
                className="w-full bg-fintech-bg border border-white/10 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
