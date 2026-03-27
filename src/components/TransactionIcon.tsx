import React, { useState } from "react";
import { getVendorLogo, getCategoryIcon } from "../utils/vendorUtils";
import { LucideIcon } from "lucide-react";

interface TransactionIconProps {
  title: string;
  category: string;
  type: "income" | "expense";
}

export const TransactionIcon: React.FC<TransactionIconProps> = ({ title, category, type }) => {
  const [logoErrorCount, setLogoErrorCount] = useState(0);
  const logo = getVendorLogo(title);
  const Icon = getCategoryIcon(category, type);

  // Fallback chain: Clearbit -> Google Favicon -> Lucide Icon
  const getLogoUrl = () => {
    if (!logo) return null;
    if (logoErrorCount === 0) return logo; // Clearbit
    if (logoErrorCount === 1) {
      // Extract domain from Clearbit URL
      const domain = logo.split('/').pop();
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    }
    return null;
  };

  const currentLogo = getLogoUrl();

  return (
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors overflow-hidden ${
      type === "income" 
        ? "bg-fintech-success/10 text-fintech-success" 
        : "bg-fintech-danger/10 text-fintech-danger"
    }`}>
      {currentLogo ? (
        <img 
          src={currentLogo} 
          alt={title} 
          className="w-full h-full object-contain p-1"
          referrerPolicy="no-referrer"
          onError={() => setLogoErrorCount(prev => prev + 1)}
        />
      ) : (
        <Icon size={24} />
      )}
    </div>
  );
};
