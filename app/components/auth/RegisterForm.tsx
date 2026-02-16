"use client";
import Label from "@/app/components/form/Label";
import { EyeSlashIcon, EyeIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import React, { useState } from "react";
import AreaServiceForm from "./AreaServiceForm";

export default function RegisterForm() {
   const [showPassword, setShowPassword] = useState(false);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState("");
   const [success, setSuccess] = useState("");

   const [nik, setNik] = useState("");
   const [nama, setNama] = useState("");
   const [jabatan, setJabatan] = useState("");
   const [username, setUsername] = useState("");
   const [password, setPassword] = useState("");
   const [role, setRole] = useState("");
   const [idArea, setIdArea] = useState("");
   const [idSa, setIdSa] = useState("");

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError("");
      setSuccess("");

      try {
         const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               nik,
               nama,
               jabatan,
               username,
               password,
               role,
               id_area: idArea,
               id_sa: idSa,
            }),
         });

         const data = await res.json();

         if (data.success) {
            setSuccess("Registrasi berhasil! Redirect ke login...");
            setTimeout(() => {
               window.location.href = "/login";
            }, 1500);
         } else {
            setError(data.message);
         }
      } catch (err) {
         setError("Terjadi kesalahan. Silakan coba lagi.");
      } finally {
         setLoading(false);
      }
   };

   return (
      <div className="flex flex-col flex-1 lg:w-1/2 w-full overflow-y-auto no-scrollbar bg-gray-50 dark:bg-gray-900">
         <div className="flex-1 flex flex-col justify-center px-4 py-6 sm:px-6 lg:px-12">
            <div className="w-full max-w-md mx-auto">
               <div className="lg:hidden mb-6">
                  <Link
                     href="/"
                     className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700">
                     &larr; Back to dashboard
                  </Link>
               </div>

               <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
                  <div className="mb-6 sm:mb-8">
                     <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mb-2">
                        Daftar Akun
                     </h1>
                     <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
                        Buat akun untuk mulai menggunakan sistem
                     </p>
                  </div>

                  <form
                     onSubmit={handleSubmit}
                     className="space-y-4 sm:space-y-5">
                     {error && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                           {error}
                        </div>
                     )}
                     {success && (
                        <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                           {success}
                        </div>
                     )}

                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                           <Label>
                              NIK <span className="text-red-500">*</span>
                           </Label>
                           <input
                              type="text"
                              placeholder="Masukkan NIK"
                              value={nik}
                              onChange={(e) => setNik(e.target.value)}
                              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              required
                           />
                        </div>

                        <div>
                           <Label>
                              Nama <span className="text-red-500">*</span>
                           </Label>
                           <input
                              type="text"
                              placeholder="Nama lengkap"
                              value={nama}
                              onChange={(e) => setNama(e.target.value)}
                              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              required
                           />
                        </div>
                     </div>

                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                           <Label>
                              Jabatan <span className="text-red-500">*</span>
                           </Label>
                           <input
                              type="text"
                              placeholder="Jabatan"
                              value={jabatan}
                              onChange={(e) => setJabatan(e.target.value)}
                              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              required
                           />
                        </div>

                        <div>
                           <Label>
                              Username <span className="text-red-500">*</span>
                           </Label>
                           <input
                              type="text"
                              placeholder="Username"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              required
                           />
                        </div>
                     </div>

                     <div>
                        <Label>
                           Password <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                           <input
                              type={showPassword ? "text" : "password"}
                              placeholder="Minimal 6 karakter"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 pr-11 text-sm bg-white dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              required
                              minLength={6}
                           />
                           <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                              {showPassword ? (
                                 <EyeSlashIcon className="w-5 h-5" />
                              ) : (
                                 <EyeIcon className="w-5 h-5" />
                              )}
                           </button>
                        </div>
                     </div>

                     <div>
                        <AreaServiceForm />
                     </div>

                     <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 sm:h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base">
                        {loading ? (
                           <span className="flex items-center justify-center gap-2">
                              <svg
                                 className="animate-spin h-4 w-4"
                                 viewBox="0 0 24 24">
                                 <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="none"
                                 />
                                 <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                 />
                              </svg>
                              Memproses...
                           </span>
                        ) : (
                           "Daftar Sekarang"
                        )}
                     </button>
                  </form>

                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                     <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                        Sudah punya akun?{" "}
                        <Link
                           href="/login"
                           className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium">
                           Masuk di sini
                        </Link>
                     </p>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
}
