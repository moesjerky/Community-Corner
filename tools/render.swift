import PDFKit; import AppKit
// usage: swift render.swift <outroot> <pdf>...   -> <outroot>/<num>/p1.jpg.. + cover.jpg (right half of page 1 when it's a spread)
let a=CommandLine.arguments
func save(_ im:NSImage,_ path:String,_ q:CGFloat){let r=NSBitmapImageRep(data:im.tiffRepresentation!)!
 try! r.representation(using:.jpeg,properties:[.compressionFactor:q])!.write(to:URL(fileURLWithPath:path))}
for pdf in a.dropFirst(2){
 guard let d=PDFDocument(url:URL(fileURLWithPath:pdf)) else{print("FAIL",pdf);continue}
 let name=(pdf as NSString).lastPathComponent
 let num=name.components(separatedBy:CharacterSet.decimalDigits.inverted).filter{!$0.isEmpty}.last!
 let out="\(a[1])/\(num)"; try! FileManager.default.createDirectory(atPath:out,withIntermediateDirectories:true)
 for i in 0..<d.pageCount{ autoreleasepool{ let p=d.page(at:i)!
  save(p.thumbnail(of:NSSize(width:2000,height:2000),for:.mediaBox),"\(out)/p\(i+1).jpg",0.72)
  if i==0{let im=p.thumbnail(of:NSSize(width:1600,height:1600),for:.mediaBox); let land=im.size.width>im.size.height
   let w=land ? im.size.width/2 : im.size.width, h=im.size.height; let c=NSImage(size:NSSize(width:w,height:h)); c.lockFocus()
   im.draw(in:NSRect(x:0,y:0,width:w,height:h),from:NSRect(x:land ? w:0,y:0,width:w,height:h),operation:.copy,fraction:1); c.unlockFocus(); save(c,"\(out)/cover.jpg",0.8)}}}
 print(num,d.pageCount)
}
