// Development-only bundling; end users execute the checked-in bundle directly.
const esbuild=require('esbuild');
const fs=require('node:fs');
const path=require('node:path');
async function main(){
  const root=path.resolve(__dirname,'..');
  const build=await esbuild.build({absWorkingDir:root,nodePaths:(process.env.NODE_PATH||'').split(path.delimiter).filter(Boolean),entryPoints:['src/cli.cjs'],outfile:'scripts/wechat-to-md.cjs',bundle:true,platform:'node',format:'cjs',target:'node18',external:['canvas'],define:{'require.resolve':'undefined'},minifyWhitespace:true,legalComments:'linked',metafile:true});
  const packages=new Map();
  for(const input of Object.keys(build.metafile.inputs)){
    let directory=path.dirname(path.resolve(root,input));
    while(directory!==path.dirname(directory)){
      const file=path.join(directory,'package.json');
      if(fs.existsSync(file)){
        const metadata=JSON.parse(fs.readFileSync(file,'utf8'));
        if(metadata.name){
          if(metadata.name!=='wechat-article-to-md-skill') packages.set(directory,metadata);
          break;
        }
      }
      directory=path.dirname(directory);
    }
  }
  const notices=['# Third-party notices','', 'Bundled dependencies retain their own licenses. Optional canvas is not included.',''];
  const missing=[];
  for(const [directory,pkg] of [...packages].sort((a,b)=>a[1].name.localeCompare(b[1].name))){
    const licenses=fs.readdirSync(directory).filter(name=>/^(?:licen[sc]e|copying|notice)(?:[._-]|$)/i.test(name)&&fs.statSync(path.join(directory,name)).isFile());
    const override=path.join(root,'licenses',pkg.name.replaceAll('/','__')+'.txt');
    const readme=path.join(directory,'README.md');
    const embedded=fs.existsSync(readme)?fs.readFileSync(readme,'utf8').match(/(?:^|\n)License\r?\n-+\r?\n([\s\S]+)/i)?.[1]:undefined;
    if(!licenses.length&&!fs.existsSync(override)&&!embedded){missing.push({name:pkg.name,version:pkg.version,repository:pkg.repository});continue;}
    notices.push(`## ${pkg.name} ${pkg.version}`,'',`Declared license: ${typeof pkg.license==='string'?pkg.license:JSON.stringify(pkg.license)}`,'');
    for(const name of licenses) notices.push('```text',fs.readFileSync(path.join(directory,name),'utf8').trim(),'```','');
    if(!licenses.length) notices.push('```text',(fs.existsSync(override)?fs.readFileSync(override,'utf8'):embedded).trim(),'```','');
  }
  if(missing.length) throw Error('Missing license text: '+JSON.stringify(missing));
  fs.writeFileSync(path.join(root,'THIRD_PARTY_NOTICES.md'),notices.join('\n').replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,''));
  console.log(JSON.stringify({bundled_packages:packages.size,output:'scripts/wechat-to-md.cjs'}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
