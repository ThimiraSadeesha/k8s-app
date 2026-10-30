from fastapi import APIRouter, Depends, Query

from app.api.deps import current_session
from app.schemas.infra import ActionIn, RemoveIn
from app.services import ssh
from app.services.sessions import Session

router = APIRouter(tags=["server"])


@router.get("/overview")
async def overview(session: Session = Depends(current_session)):
    """Host facts, live usage and every container, read from the server right now."""
    report = await ssh.collect(session)
    return {"host": session.host, "facts": report.facts, "metrics": report.metrics,
            "containers": report.containers, "docker_available": report.containers_complete}


@router.post("/containers/{docker_id}/actions")
async def container_action(docker_id: str, body: ActionIn, session: Session = Depends(current_session)):
    return await ssh.container_action(session, docker_id, body.action)


@router.post("/containers/{docker_id}/remove", status_code=204)
async def container_remove(docker_id: str, body: RemoveIn, session: Session = Depends(current_session)):
    await ssh.container_remove(session, docker_id, body.force)


@router.get("/containers/{docker_id}/logs")
async def container_logs(docker_id: str, tail: int = Query(200, ge=1, le=2000),
                         session: Session = Depends(current_session)):
    return {"lines": await ssh.container_logs(session, docker_id, tail)}
