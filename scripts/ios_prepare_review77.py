import sys,os,json,tempfile,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,"scripts")
import ios_appstore_upload as auth
APP="6782046749"; BUILD="06282ea5-7770-4c4f-aa4e-c63d7e284b68"; OLD="0f439799-f7e7-4d43-8cb6-276d7a02a026"
def req(path,method="GET",data=None):
    r=urllib.request.Request("https://api.appstoreconnect.apple.com/v1/"+path,headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"},data=None if data is None else json.dumps(data).encode(),method=method)
    try:
        with urllib.request.urlopen(r,timeout=45) as v:
            b=v.read()
            return json.loads(b) if b else {}
    except urllib.error.HTTPError as e:
        try: errors=json.load(e).get("errors",[])
        except Exception: errors=[]
        print("APPLE_ERROR",method,path,e.code,json.dumps([{"code":x.get("code"),"title":x.get("title"),"detail":x.get("detail")} for x in errors]))
        raise SystemExit(2)
with tempfile.TemporaryDirectory() as d:
    p=Path(d)/"key.p8";p.write_text(os.environ.pop("APP_STORE_CONNECT_API_PRIVATE_KEY").strip()+"\n");p.chmod(0o600)
    token=auth.access_token(p)
    b=req("builds/"+BUILD)["data"]
    assert b["attributes"]["version"]=="77" and b["attributes"]["processingState"]=="VALID"
    vs=req("apps/"+APP+"/appStoreVersions?filter[platform]=IOS&limit=50")["data"]
    found=[v for v in vs if v["attributes"]["versionString"]=="1.0.68"]
    assert len(found)<=1
    if found:v=found[0]
    else:
        v=req("appStoreVersions","POST",{"data":{"type":"appStoreVersions","attributes":{"platform":"IOS","versionString":"1.0.68","releaseType":"AFTER_APPROVAL","copyright":"© 2026 SILGAPP"},"relationships":{"app":{"data":{"type":"apps","id":APP}}}}})["data"]
    vid=v["id"];print("VERSION",vid,v["attributes"]["appStoreState"],v["attributes"]["releaseType"])
    if v["attributes"]["appStoreState"] not in ("PREPARE_FOR_SUBMISSION","DEVELOPER_REJECTED","REJECTED"):raise SystemExit("Existing review state: no changes.")
    req("appStoreVersions/"+vid,"PATCH",{"data":{"type":"appStoreVersions","id":vid,"attributes":{"releaseType":"AFTER_APPROVAL"}}})
    req("appStoreVersions/"+vid+"/relationships/build","PATCH",{"data":{"type":"builds","id":BUILD}})
    oldb=req("appStoreVersions/"+OLD+"/build")["data"]
    print("ENCRYPTION",json.dumps({"old":oldb["attributes"].get("usesNonExemptEncryption"),"new":b["attributes"].get("usesNonExemptEncryption")}))
    locs=req("appStoreVersions/"+vid+"/appStoreVersionLocalizations")["data"]
    for l in locs:
        a=l["attributes"]
        print("LOCALE",l["id"],a["locale"],json.dumps({k:bool(a.get(k)) for k in ("description","keywords","supportUrl","whatsNew")}))
        sets=req("appStoreVersionLocalizations/"+l["id"]+"/appScreenshotSets?include=appScreenshots")
        print("SCREENSHOTS",json.dumps([{"id":s["id"],"type":s["attributes"].get("screenshotDisplayType"),"count":len(s.get("relationships",{}).get("appScreenshots",{}).get("data",[]))} for s in sets.get("data",[])]))
    detail=req("appStoreVersions/"+vid+"/appStoreReviewDetail").get("data") or {}
    print("REVIEW",detail.get("id"),json.dumps({k:bool(detail.get("attributes",{}).get(k)) for k in ("demoAccountName","demoAccountPassword","contactFirstName","contactLastName","contactPhone","contactEmail","notes")}))
