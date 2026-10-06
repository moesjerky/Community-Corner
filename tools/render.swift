import PDFKit; import AppKit
// usage: swift render.swift <pdf> <outdir>   -> p1.jpg.. + cover.jpg (right half of page 1)
let a=CommandLine.arguments; let d=PDFDocument(url:URL(fileURLWithPath:a[1]))!
func save(_ im:NSImage,_ n:String){let r=NSBitmapImageRep(data:im.tiffRepresentation!)!
 try! r.representation(using:.jpeg,properties:[.compressionFactor:0.78])!.write(to:URL(fileURLWithPath:"\(a[2])/\(n)"))}
for i in 0..<d.pageCount{let p=d.page(at:i)!; save(p.thumbnail(of:NSSize(width:2400,height:2400),for:.mediaBox),"p\(i+1).jpg")
 if i==0{let b=p.bounds(for:.mediaBox); let im=p.thumbnail(of:NSSize(width:1600,height:1600),for:.mediaBox)
  let w=im.size.width/2, h=im.size.height; let c=NSImage(size:NSSize(width:w,height:h)); c.lockFocus()
  im.draw(in:NSRect(x:0,y:0,width:w,height:h),from:NSRect(x:w,y:0,width:w,height:h),operation:.copy,fraction:1); c.unlockFocus(); save(c,"cover.jpg"); _=b}}
print(d.pageCount)
