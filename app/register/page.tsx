import RegisterForm from "../components/auth/RegisterForm";

export default function RegisterPage() {
   return (
      <div className="flex min-h-screen">
         <div className="hidden lg:flex w-1/2 bg-linear-to-br from-blue-600 to-indigo-700 text-white p-8 lg:p-12 flex-col justify-between">
            <div>
               <h1 className="text-2xl lg:text-3xl font-bold">Dompis</h1>
            </div>
            <div className="my-8">
               <h2 className="text-3xl lg:text-4xl font-bold leading-tight mb-4 lg:mb-6">
                  Join Our Team
               </h2>
               <p className="text-blue-100 text-sm lg:text-base max-w-md">
                  Create an account to start managing tickets and workflow efficiently.
               </p>
            </div>
            <div className="text-xs lg:text-sm text-blue-200">
               &copy; {new Date().getFullYear()} Dompis. All rights reserved.
            </div>
         </div>
         <RegisterForm />
      </div>
   );
}
