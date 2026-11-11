import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
export default function Layout() {
  const [navOpen,setNavOpen]=useState(false)
  return <div className="flex h-screen flex-col supports-[height:100dvh]:h-dvh bg-cream-50 dark:bg-gray-900 text-ink-900 dark:text-white">
    <Header navOpen={navOpen} onOpenNavigation={()=>setNavOpen(true)}/>
    <div className="flex min-h-0 flex-1">
    {navOpen&&<button aria-label="Close navigation" className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={()=>setNavOpen(false)}/>}
    <Sidebar open={navOpen} onClose={()=>setNavOpen(false)}/>
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <main id="main-content" className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-5"><Outlet/></main>
    </div>
    </div>
  </div>
}
