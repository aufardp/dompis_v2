"use client";
import React, { useState, useRef, useEffect } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

interface Option {
   value: string;
   label: string;
}

interface SearchableSelectProps {
   options: Option[];
   placeholder?: string;
   onChange: (value: string) => void;
   className?: string;
   defaultValue?: string;
   label?: string;
   required?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
   options,
   placeholder = "Search...",
   onChange,
   className = "",
   defaultValue = "",
   label,
   required = false,
}) => {
   const [isOpen, setIsOpen] = useState(false);
   const [search, setSearch] = useState("");
   const [selectedValue, setSelectedValue] = useState(defaultValue);
   const wrapperRef = useRef<HTMLDivElement>(null);

   const selectedOption = options.find((opt) => opt.value === selectedValue);

   const filteredOptions = options.filter((opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase())
   );

   useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
         if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
            setIsOpen(false);
         }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
   }, []);

   const handleSelect = (value: string) => {
      setSelectedValue(value);
      onChange(value);
      setIsOpen(false);
      setSearch("");
   };

   return (
      <div className={`relative ${className}`} ref={wrapperRef}>
         {label && (
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
               {label}
               {required && <span className="text-error-500"> *</span>}
            </label>
         )}
         <div
            onClick={() => setIsOpen(!isOpen)}
            className="h-11 w-full cursor-pointer flex items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
         >
            <span className={selectedOption ? "text-gray-900 dark:text-white" : "text-gray-400"}>
               {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
         </div>
         {isOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-300 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 max-h-60 overflow-auto">
               <div className="p-2">
                  <input
                     type="text"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     placeholder="Search..."
                     className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-300 focus:outline-hidden dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                     autoFocus
                     onClick={(e) => e.stopPropagation()}
                  />
               </div>
               {filteredOptions.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-gray-500">No options found</div>
               ) : (
                  filteredOptions.map((option) => (
                     <div
                        key={option.value}
                        onClick={() => handleSelect(option.value)}
                        className="cursor-pointer px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-gray-700 dark:text-white"
                     >
                        {option.label}
                     </div>
                  ))
               )}
            </div>
         )}
      </div>
   );
};

export default SearchableSelect;
