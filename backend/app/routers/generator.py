from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.crud import check_case_refs, get_or_404
from app.db import get_db
from app.generator import ParamSpec, generate_cases, parse_signature
from app.models import TestCase, Technique, Upload
from app.routers.uploads import parse_functions
from app.schemas import GeneratedCaseOut, GenerateRequest, GenerateResponse

router = APIRouter(prefix="/generate", tags=["generator"])


@router.post("", response_model=GenerateResponse)
def generate(body: GenerateRequest, db: Session = Depends(get_db)):
    """Generate EP/BVA test cases for a function signature, optionally saving
    them as test cases under a requirement."""
    try:
        function, names = parse_signature(body.signature)
    except ValueError as e:
        raise HTTPException(422, str(e))

    missing = [n for n in names if n not in body.params]
    extra = sorted(set(body.params) - set(names))
    if missing or extra:
        raise HTTPException(
            422, {"missing_param_specs": missing, "unknown_param_specs": extra}
        )

    try:
        cases = generate_cases(
            [ParamSpec(name=n, **body.params[n].model_dump()) for n in names]
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    if body.upload_id is not None:
        upload = get_or_404(db, Upload, body.upload_id)
        if function not in {f.name for f in parse_functions(upload.source)}:
            raise HTTPException(422, f"{upload.filename} has no public function {function!r}")

    out = [
        GeneratedCaseOut(
            inputs=c.inputs,
            technique=Technique(c.technique),
            partition=c.partition,
            expected_outcome=c.expected_outcome,
        )
        for c in cases
    ]

    if body.persist:
        if body.requirement_id is None:
            raise HTTPException(422, "requirement_id is required when persist is true")
        requirement = check_case_refs(db, body.requirement_id, body.scenario_id, body.suite_id)
        saved = [
            TestCase(
                title=f"{function}: {c.partition}",
                requirement_id=requirement.id,
                scenario_id=body.scenario_id,
                suite_id=body.suite_id,
                upload_id=body.upload_id,
                priority=body.priority,
                test_type=body.test_type,
                technique=Technique(c.technique),
                module=requirement.module,
                function_under_test=body.signature.strip(),
                inputs=c.inputs,
                expected_outcome=c.expected_outcome,
            )
            for c in cases
        ]
        db.add_all(saved)
        db.commit()
        for o, tc in zip(out, saved):
            o.test_case_id, o.code = tc.id, tc.code

    return GenerateResponse(function=function, parameters=names, cases=out)
