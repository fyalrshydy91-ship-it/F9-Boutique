import {useEffect,useState} from 'react';
export function useStore<T>(key:string,initial:T){
 const [value,setValue]=useState<T>(()=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):initial}catch{return initial}});
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Private browsing remains fully interactive. */}},[key,value]);
 return [value,setValue] as const;
}
