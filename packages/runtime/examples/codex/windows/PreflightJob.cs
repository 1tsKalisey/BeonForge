// B04-01c.1b diagnostic ONLY. No agent execution or general command interface.
// Build with the Windows inbox Framework64 csc; no package restore.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

internal static class PreflightJob
{
    const string CodexHash = "9d563ee4e0441ff9d59d612013e0460ddf8e5709735c2d9f6b98b7ef8ca4eb42";
    const string CodeHostHash = "977c1f01c9efac0bfe1b9032717c95f92e1c965c8441a8dacbfe824c5c79a527";
    const uint Suspended = 4, NoWindow = 0x08000000, KillOnClose = 0x2000;
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct Startup { public int cb; public string reserved, desktop, title; public uint x,y,xs,ys,xc,yc,fill,flags; public short show, reserved2; public IntPtr reservedPtr, input, output, error; }
    [StructLayout(LayoutKind.Sequential)]
    struct Info { public IntPtr process, thread; public uint pid, tid; }
    [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup startup; public IntPtr list; }
    [StructLayout(LayoutKind.Sequential)] struct Security { public int size; public IntPtr descriptor; public int inherit; }
    [StructLayout(LayoutKind.Sequential)] struct FileInfo { public uint attributes; public System.Runtime.InteropServices.ComTypes.FILETIME creation, access, write; public uint volume, highSize, lowSize, links, highIndex, lowIndex; }
    [StructLayout(LayoutKind.Sequential)]
    struct Basic { public long processTime, jobTime; public uint flags; public UIntPtr min, max; public uint count; public UIntPtr affinity; public uint priority, scheduling; }
    [StructLayout(LayoutKind.Sequential)]
    struct Limits { public Basic basic; public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateProcessW(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref Startup si, out Info pi);
    [DllImport("kernel32.dll", EntryPoint="CreateProcessW", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateExtended(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref StartupEx si, out Info pi);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr key, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileW(string path, uint access, uint share, ref Security security, uint disposition, uint attributes, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr file, out FileInfo info);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFinalPathNameByHandleW(IntPtr file, StringBuilder path, uint size, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref Limits info, int size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int cls, IntPtr data, uint size, out uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetHandleInformation(IntPtr handle, out uint flags);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint rights, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder path, ref uint length);
    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static string Quote(string s) { return "\"" + s.Replace("\"", "\\\"") + "\""; } // Inputs reject quotes and trailing separators below.
    static void Physical(string path, bool file)
    {
        if (path.IndexOf('"') >= 0 || !Path.IsPathRooted(path) || Path.GetFullPath(path) != path || path.EndsWith("\\")) throw new Exception("noncanonical_path");
        for (string p=path; p!=null; p=Path.GetDirectoryName(p)) {
            if ((File.GetAttributes(p) & FileAttributes.ReparsePoint)!=0) throw new Exception("reparse_path");
            if (Path.GetPathRoot(p)==p) break;
        }
        if (file && !File.Exists(path)) throw new Exception("missing_file");
    }
    static FileStream Pin(string path, string expected)
    {
        Physical(path,true);
        // Deny write AND delete sharing until child has exited. Hash the held file.
        FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        FileInfo info; StringBuilder final=new StringBuilder(32768);
        try {
            Check(GetFileInformationByHandle(stream.SafeFileHandle.DangerousGetHandle(),out info));
            uint size=GetFinalPathNameByHandleW(stream.SafeFileHandle.DangerousGetHandle(),final,32768,0);
            Check(size>0 && size<32768);
            if(info.links!=1 || !String.Equals(final.ToString(),"\\\\?\\"+path,StringComparison.OrdinalIgnoreCase)) throw new Exception("physical_identity_mismatch");
        } catch { stream.Dispose(); throw; }
        string actual;
        using (SHA256 sha=SHA256.Create()) actual=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        if (actual!=expected) { stream.Dispose(); throw new Exception("executable_hash_mismatch"); }
        stream.Position=0; return stream;
    }
    static Info Start(string app, string args, string cwd, bool suspended)
    {
        Startup si=new Startup(); si.cb=Marshal.SizeOf(si); Info pi;
        Check(CreateProcessW(app,new StringBuilder(Quote(app)+" "+args),IntPtr.Zero,IntPtr.Zero,false,NoWindow|(suspended?Suspended:0),IntPtr.Zero,cwd,ref si,out pi));
        return pi;
    }
    static Info StartCodex(string app, string args, string cwd, string logName, IntPtr job)
    {
        Security security=new Security(); security.size=Marshal.SizeOf(security); security.inherit=1;
        IntPtr output=IntPtr.Zero, error=IntPtr.Zero, input=IntPtr.Zero, list=IntPtr.Zero, handles=IntPtr.Zero, jobList=IntPtr.Zero;
        bool initialized=false;
        try {
            output=CreateFileW(Path.Combine(cwd,logName+".stdout.txt"),0x40000000,1,ref security,1,0,IntPtr.Zero);
            error=CreateFileW(Path.Combine(cwd,logName+".stderr.txt"),0x40000000,1,ref security,1,0,IntPtr.Zero);
            input=CreateFileW("NUL",0x80000000,3,ref security,3,0,IntPtr.Zero);
            Check(output!=new IntPtr(-1) && error!=new IntPtr(-1) && input!=new IntPtr(-1));
            int count=job==IntPtr.Zero?1:2;
            IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,count,0,ref size);
            list=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(list,count,0,ref size)); initialized=true;
            handles=Marshal.AllocHGlobal(IntPtr.Size*3);
            Marshal.WriteIntPtr(handles,0,input); Marshal.WriteIntPtr(handles,IntPtr.Size,output); Marshal.WriteIntPtr(handles,IntPtr.Size*2,error);
            Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
            if(job!=IntPtr.Zero) {
                // Atomic membership at creation also closes the launcher-death window
                // between CreateProcess and an explicit AssignProcessToJobObject call.
                jobList=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobList,job);
                Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000D),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
            }
            StartupEx si=new StartupEx(); si.startup.cb=Marshal.SizeOf(si); si.startup.flags=0x100;
            si.startup.input=input; si.startup.output=output; si.startup.error=error; si.list=list;
            Info pi; Check(CreateExtended(app,new StringBuilder(Quote(app)+" "+args),IntPtr.Zero,IntPtr.Zero,true,NoWindow|Suspended|0x80000,IntPtr.Zero,cwd,ref si,out pi)); return pi;
        } finally {
            if(initialized) DeleteProcThreadAttributeList(list);
            if(list!=IntPtr.Zero) Marshal.FreeHGlobal(list);
            if(handles!=IntPtr.Zero) Marshal.FreeHGlobal(handles);
            if(jobList!=IntPtr.Zero) Marshal.FreeHGlobal(jobList);
            foreach(IntPtr h in new IntPtr[]{output,error,input}) if(h!=IntPtr.Zero && h!=new IntPtr(-1)) CloseHandle(h);
        }
    }
    static string Self { get { return Process.GetCurrentProcess().MainModule.FileName; } }
    static string Receipt(string path)
    {
        try {
            using(FileStream stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))
            using(StreamReader reader=new StreamReader(stream)) {
                string value=reader.ReadToEnd(); return value.EndsWith("\n")?value.Trim():"";
            }
        } catch(IOException) { return ""; } // A write in progress is not a completed receipt.
    }
    static void Fixture(string root, string role, string mode)
    {
        // No CreateJobObject, no libuv, no detached/breakaway flags. Fixed safety expiry
        // is 30s; observations must finish before it, and are never credited to it.
        if (role=="root" || role=="child") {
            Info child=Start(Self,"--fixture "+Quote(root)+" "+(role=="root"?"child":"grand")+" "+mode,root,false);
            CloseHandle(child.thread); CloseHandle(child.process);
        }
        using(FileStream stream=new FileStream(Path.Combine(root,"out",role+".txt"),FileMode.Truncate,FileAccess.Write,FileShare.ReadWrite))
        using(StreamWriter writer=new StreamWriter(stream)) writer.Write(Process.GetCurrentProcess().Id.ToString()+"\n");
        if (role=="root" && mode=="normal") {
            Stopwatch wait=Stopwatch.StartNew();
            while ((Receipt(Path.Combine(root,"out","child.txt")).Length==0 || Receipt(Path.Combine(root,"out","grand.txt")).Length==0) && wait.ElapsedMilliseconds<5000) Thread.Sleep(5);
            Thread.Sleep(300); return;
        }
        Thread.Sleep(30000);
    }
    static int Active(IntPtr job)
    {
        IntPtr data=Marshal.AllocHGlobal(4096);
        try { uint length; Check(QueryInformationJobObject(job,3,data,4096,out length)); return Marshal.ReadInt32(data,4); }
        finally { Marshal.FreeHGlobal(data); }
    }
    static void Members(IntPtr job)
    {
        IntPtr data=Marshal.AllocHGlobal(4096);
        try {
            uint length; Check(QueryInformationJobObject(job,3,data,4096,out length));
            int count=Marshal.ReadInt32(data,4); if(count>100) throw new Exception("unexpected_job_size");
            for(int i=0;i<count;i++) {
                uint pid=(uint)Marshal.ReadIntPtr(data,8+i*IntPtr.Size).ToInt64();
                IntPtr p=OpenProcess(0x1000,false,pid); Check(p!=IntPtr.Zero);
                try { StringBuilder path=new StringBuilder(32768); uint size=32768; Check(QueryFullProcessImageNameW(p,0,path,ref size)); Console.WriteLine("MEMBER "+pid+" "+path); }
                finally { CloseHandle(p); }
            }
        } finally { Marshal.FreeHGlobal(data); }
    }
    static void Run(string root, string codex, string mode, string fixtureHash)
    {
        Physical(root,false); Physical(Self,true);
        if (!Path.GetFileName(root).StartsWith("beonforge-c1b-")) throw new Exception("unauthorized_root");
        if (mode!="normal" && mode!="force" && mode!="crash" && mode!="nested" && mode!="baseline-normal" && mode!="baseline-force") throw new Exception("invalid_mode");
        bool baseline=mode.StartsWith("baseline-");
        List<FileStream> pins=new List<FileStream>(); IntPtr job=IntPtr.Zero, nested=IntPtr.Zero; Info pi=new Info();
        List<IntPtr> observed=new List<IntPtr>();
        try {
            pins.Add(Pin(Self,fixtureHash));
            string app=Self, args="--fixture "+Quote(root)+" root "+(mode.EndsWith("normal")?"normal":"hold");
            if (codex!="synthetic") {
                pins.Add(Pin(codex,CodexHash));
                pins.Add(Pin(Path.Combine(Path.GetDirectoryName(codex),"codex-code-mode-host.exe"),CodeHostHash));
                app=codex;
                args="-c "+Quote("windows.sandbox=\"mxc\"")+" sandbox --include-managed-config --permission-profile preflight --cd "+Quote(root)+" -- "+Quote(Self)+" "+args;
            }
            if (!baseline) {
                job=CreateJobObjectW(IntPtr.Zero,null); Check(job!=IntPtr.Zero);
                Limits limits=new Limits(); limits.basic.flags=KillOnClose; // Neither breakaway flag is set.
                Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(limits)));
                uint flags; Check(GetHandleInformation(job,out flags)); if ((flags&1)!=0) throw new Exception("inherited_job_handle");
            }
            if(codex!="synthetic") {
                Info version=StartCodex(app,"--version",root,"version",job);
                try {
                    bool member; if(!baseline) { Check(IsProcessInJob(version.process,job,out member)); if(!member) throw new Exception("version_association_unconfirmed"); }
                    if(ResumeThread(version.thread)!=1 || WaitForSingleObject(version.process,5000)!=0) throw new Exception("version_process_unconfirmed");
                    uint code; Check(GetExitCodeProcess(version.process,out code)); if(code!=0) throw new Exception("version_exit_failed");
                    if(File.ReadAllText(Path.Combine(root,"version.stdout.txt")).Trim()!="codex-cli 0.166.0") throw new Exception("version_mismatch");
                    Console.WriteLine("VERSION codex-cli 0.166.0");
                } finally { if(WaitForSingleObject(version.process,0)!=0) TerminateProcess(version.process,97); CloseHandle(version.thread); CloseHandle(version.process); }
            }
            pi=StartCodex(app,args,root,codex=="synthetic"?"fixture":"codex",job);
            if (!baseline) {
                bool member;
                Check(IsProcessInJob(pi.process,job,out member)); if (!member) throw new Exception("association_unconfirmed");
                if(mode=="nested") {
                    nested=CreateJobObjectW(IntPtr.Zero,null); Check(nested!=IntPtr.Zero);
                    Limits limits=new Limits(); limits.basic.flags=KillOnClose;
                    Check(SetInformationJobObject(nested,9,ref limits,Marshal.SizeOf(limits)));
                    Check(AssignProcessToJobObject(nested,pi.process));
                    Check(IsProcessInJob(pi.process,nested,out member)); if(!member) throw new Exception("nested_association_unconfirmed");
                    Console.WriteLine("NESTED true");
                }
            }
            // Child cannot write its receipt before ResumeThread. No post-spawn association race.
            if (File.ReadAllText(Path.Combine(root,"out","root.txt")).Length!=0) throw new Exception("ran_before_resume");
            Console.WriteLine("ASSOCIATED "+pi.pid+" "+(!baseline)); Console.Out.Flush();
            if (ResumeThread(pi.thread)!=1) throw new Exception("resume_failed");
            CloseHandle(pi.thread); pi.thread=IntPtr.Zero;
            Stopwatch startup=Stopwatch.StartNew();
            string[] roles={"root","child","grand"}; List<uint> ids=new List<uint>();
            while (startup.ElapsedMilliseconds<8000) {
                ids.Clear();
                foreach(string role in roles) { uint pid; if (UInt32.TryParse(Receipt(Path.Combine(root,"out",role+".txt")),out pid)) ids.Add(pid); }
                if (ids.Count==3) break; Thread.Sleep(5);
            }
            if(ids.Count!=3) throw new Exception("fixture_startup_unconfirmed");
            bool allMembers=!baseline;
            foreach(uint pid in ids) {
                IntPtr handle=OpenProcess(0x100000|0x1000|1,false,pid); Check(handle!=IntPtr.Zero); observed.Add(handle);
                StringBuilder image=new StringBuilder(32768); uint length=32768; Check(QueryFullProcessImageNameW(handle,0,image,ref length));
                if(!String.Equals(image.ToString(),Self,StringComparison.OrdinalIgnoreCase)) throw new Exception("unexpected_image");
                bool member=false; if(!baseline) Check(IsProcessInJob(handle,job,out member)); allMembers &= member;
            }
            if(!baseline) Members(job);
            Console.WriteLine("READY "+String.Join(",",ids)+" MEMBERS "+allMembers+" ACTIVE "+(baseline?-1:Active(job))); Console.Out.Flush();
            // crash mode deliberately waits for the controller to terminate this launcher.
            if(mode=="crash") { Thread.Sleep(15000); throw new Exception("controller_did_not_terminate_launcher"); }
            if(mode.EndsWith("normal")) {
                if(WaitForSingleObject(pi.process,5000)!=0) throw new Exception("normal_exit_unconfirmed");
            }
            Stopwatch stop=Stopwatch.StartNew();
            if(!baseline) Check(TerminateJobObject(job,99));
            else if(mode=="baseline-force") Check(TerminateProcess(pi.process,99));
            bool ended=false;
            while(stop.ElapsedMilliseconds<500) {
                ended=true; foreach(IntPtr p in observed) ended &= WaitForSingleObject(p,0)==0;
                if(ended && (baseline || Active(job)==0)) break; Thread.Sleep(1);
            }
            Console.WriteLine("RESULT "+ended+" MS "+stop.ElapsedMilliseconds+" EMPTY "+(baseline?-1:Active(job))); Console.Out.Flush();
            Console.Write("SURVIVORS"); foreach(IntPtr p in observed) Console.Write(" "+(WaitForSingleObject(p,0)!=0)); Console.WriteLine();
            // Observation is complete BEFORE cleanup; use owned original process handles.
            foreach(IntPtr p in observed) if(WaitForSingleObject(p,0)!=0) Check(TerminateProcess(p,98));
            foreach(IntPtr p in observed) if(WaitForSingleObject(p,1000)!=0) throw new Exception("cleanup_unconfirmed");
            Console.WriteLine("CLEAN true");
        } finally {
            if(pi.thread!=IntPtr.Zero) { TerminateProcess(pi.process,97); CloseHandle(pi.thread); }
            if(job!=IntPtr.Zero) CloseHandle(job);
            if(nested!=IntPtr.Zero) CloseHandle(nested);
            if(pi.process!=IntPtr.Zero) { if(WaitForSingleObject(pi.process,0)!=0) TerminateProcess(pi.process,97); CloseHandle(pi.process); }
            foreach(IntPtr p in observed) { if(WaitForSingleObject(p,0)!=0) TerminateProcess(p,97); CloseHandle(p); }
            foreach(FileStream stream in pins) stream.Dispose();
        }
    }
    static int Main(string[] args)
    {
        try {
            if(args.Length>0 && args[0]=="--launch") {
                Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)) { AutoFlush=true });
                Console.SetError(new StreamWriter(Console.OpenStandardError(),new UTF8Encoding(false)) { AutoFlush=true });
            }
            if(args.Length==4 && args[0]=="--fixture") { Fixture(args[1],args[2],args[3]); return 0; }
            if(args.Length!=5 || args[0]!="--launch") throw new Exception("invalid_arguments");
            Run(args[1],args[2],args[3],args[4]); return 0;
        } catch(Exception error) { Console.Error.WriteLine("BLOCKED "+error.GetType().Name+" "+error.Message); return 2; }
    }
}
