import {useState} from 'react';
import {image,type Product} from './_data';
export function ProductGallery({product,ar}:{product:Product;ar:boolean}){
 const [view,setView]=useState(0);
 const sources=[product.image,`${product.image}-detail`];
 return <div>
  <div className="main-photo"><img src={image(sources[view])} alt={(ar?product.ar:product.name)+(view?(ar?' — تفاصيل القماش':' — fabric detail'):'')}/></div>
  <div className="thumbnails">{sources.map((source,index)=><button key={source} className={view===index?'selected':''} onClick={()=>setView(index)} aria-label={index?(ar?'صورة تفاصيل القماش':'Fabric detail photograph'):(ar?'عرض القطعة كاملة':'Full garment photograph')} aria-pressed={view===index}><img src={image(source)} alt=""/></button>)}</div>
  <p className="result-note" style={{marginTop:12}}>{ar?'صور تحريرية مولّدة بالذكاء الاصطناعي. اللون المختار موضح أدناه؛ الصور لا تتغير بتغييره.':'AI-generated editorial imagery. Selected color is indicated below; photos do not change by color.'}</p>
 </div>;
}
