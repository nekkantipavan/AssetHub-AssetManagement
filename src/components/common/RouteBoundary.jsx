import { Component } from 'react'
export default class RouteBoundary extends Component {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed ? <div role="alert" className="p-8 bg-white dark:bg-gray-800 rounded-3xl"><h2 className="font-bold">This page could not load.</h2><p className="text-sm mt-2">Your saved records are safe. Reload to try again.</p><button onClick={()=>window.location.reload()} className="mt-4 text-brand-600 underline">Reload page</button></div> : this.props.children}
}
