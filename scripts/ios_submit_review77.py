import sys,os,json,tempfile,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,"scripts")
import ios_appstore_upload as auth
APP="6782046749"; BUILD="06282ea5-7770-4c4f-aa4e-c63d7e284b68"; VID="4de6cc06-51e3-4e64-842a-d72d1513a138"; OLD="0f439799-f7e7-4d43-8cb6-276d7a02a026"
def req(path,method="GET",data=None):
    r=urllib.request.Request("https://api.appstoreconnect.apple.com/v1/"+path,headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"},data=None if data is None else json.dumps(data).encode(),method=method)
    try:
        with urllib.request.urlopen(r,timeout=45) as v:
            b=v.read();return json.loads(b) if b else {}
    except urllib.error.HTTPError as e:
        try: errors=json.load(e).get("errors",[])
        except Exception: errors=[]
        print("APPLE_ERROR",method,path,e.code,json.dumps([{"code":x.get("code"),"title":x.get("title"),"detail":x.get("detail")} for x in errors]))
        raise SystemExit(2)
with tempfile.TemporaryDirectory() as d:
    p=Path(d)/"key.p8";p.write_text(os.environ.pop("APP_STORE_CONNECT_API_PRIVATE_KEY").strip()+"\n");p.chmod(0o600)
    token=auth.access_token(p)
    v=req("appStoreVersions/"+VID)["data"];a=v["attributes"]
    assert a["versionString"]=="1.0.68" and a["releaseType"]=="AFTER_APPROVAL"
    assert req("appStoreVersions/"+VID+"/relationships/build")["data"]["id"]==BUILD
    if a["appStoreState"] in ("WAITING_FOR_REVIEW","IN_REVIEW","READY_FOR_SALE","PENDING_APPLE_RELEASE"):
        print("ALREADY_SUBMITTED",a["appStoreState"]);raise SystemExit(0)
    assert a["appStoreState"]=="PREPARE_FOR_SUBMISSION"
    b=req("builds/"+BUILD)["data"]["attributes"]
    assert b["version"]=="77" and b["processingState"]=="VALID"
    oldb=req("appStoreVersions/"+OLD+"/build")["data"]["attributes"]
    assert oldb["usesNonExemptEncryption"] is False
    if b.get("usesNonExemptEncryption") is None:
        req("builds/"+BUILD,"PATCH",{"data":{"type":"builds","id":BUILD,"attributes":{"usesNonExemptEncryption":False}}})
    else:assert b["usesNonExemptEncryption"] is False
    locs=req("appStoreVersions/"+VID+"/appStoreVersionLocalizations")["data"]
    assert len(locs)==1 and locs[0]["attributes"]["locale"]=="fr-FR"
    l=locs[0];assert all(l["attributes"].get(k) for k in ("description","keywords","supportUrl"))
    notes="Amélioration de l’expérience client et livreur, des boutiques et restaurants, des notifications sonores et des parcours invités. Corrections de stabilité et d’affichage."
    req("appStoreVersionLocalizations/"+l["id"],"PATCH",{"data":{"type":"appStoreVersionLocalizations","id":l["id"],"attributes":{"whatsNew":notes}}})
    detail=req("appStoreVersions/"+VID+"/appStoreReviewDetail")["data"]["attributes"]
    assert all(detail.get(k) for k in ("contactFirstName","contactLastName","contactPhone","contactEmail"))
    if detail.get("demoAccountRequired"):assert detail.get("demoAccountName") and detail.get("demoAccountPassword")
    rs=req("apps/"+APP+"/reviewSubmissions?limit=50")["data"]
    pending=[r for r in rs if r["attributes"]["platform"]=="IOS" and r["attributes"]["state"]!="COMPLETE"]
    assert not pending,"Existing active submission requires inspection; no duplicate created"
    r=req("reviewSubmissions","POST",{"data":{"type":"reviewSubmissions","attributes":{"platform":"IOS"},"relationships":{"app":{"data":{"type":"apps","id":APP}}}}})["data"]
    rid=r["id"];print("CREATED_REVIEW",rid)
    item=req("reviewSubmissionItems","POST",{"data":{"type":"reviewSubmissionItems","relationships":{"reviewSubmission":{"data":{"type":"reviewSubmissions","id":rid}},"appStoreVersion":{"data":{"type":"appStoreVersions","id":VID}}}}})["data"]
    print("CREATED_ITEM",item["id"])
    r=req("reviewSubmissions/"+rid,"PATCH",{"data":{"type":"reviewSubmissions","id":rid,"attributes":{"submitted":True}}})["data"]
    print("REVIEW_RESULT",rid,r["attributes"]["state"])
    v=req("appStoreVersions/"+VID)["data"]
    print("VERSION_RESULT",json.dumps({k:v["attributes"].get(k) for k in ("versionString","appStoreState","releaseType")}))
