import csv, trimesh, numpy as np, json, os
rows=list(csv.DictReader(open('public/models/raw/heart_selection.csv',encoding='utf-8')))
out=[]; allmin=np.array([1e9]*3); allmax=np.array([-1e9]*3)
for r in rows:
    p='public/models/raw/heart_obj/'+r['obj_file']
    m=trimesh.load(p,process=True,force='mesh')
    m.merge_vertices()
    m.update_faces(m.nondegenerate_faces())
    m.remove_unreferenced_vertices()
    b=m.bounds
    allmin=np.minimum(allmin,b[0]); allmax=np.maximum(allmax,b[1])
    e=m.edges_sorted; uniq,count=np.unique(e,axis=0,return_counts=True)
    out.append({'anatomy_id':r['anatomy_id'],'en':r['en'],'group':r['group'],'obj':r['obj_file'],
      'v':len(m.vertices),'f':len(m.faces),'components':len(m.split(only_watertight=False)),
      'watertight':bool(m.is_watertight),'euler':int(m.euler_number),
      'boundary_edges':int((count==1).sum()),'nonmanifold_edges':int((count>2).sum()),
      'area_mm2':round(float(m.area),1),'volume_mm3':round(float(m.volume),1),
      'extents_mm':[round(float(x),2) for x in m.extents],
      'center_mm':[round(float(x),2) for x in m.centroid]})
print('N',len(out),'global bbox min',np.round(allmin,2).tolist(),'max',np.round(allmax,2).tolist(),'size',np.round(allmax-allmin,2).tolist())
print('sum V',sum(x['v'] for x in out),'sum F',sum(x['f'] for x in out),'watertight',sum(x['watertight'] for x in out))
open('public/models/processed/geometry-audit.json','w',encoding='utf-8').write(json.dumps({'global_bbox_mm':{'min':allmin.tolist(),'max':allmax.tolist(),'size':(allmax-allmin).tolist()},'items':out},indent=2,ensure_ascii=False))
with open('public/models/processed/geometry-audit.csv','w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
for x in sorted(out,key=lambda x:-x['f'])[:12]: print(x['en'],x['f'],x['v'],x['components'],x['watertight'],x['boundary_edges'])
