"""The five academic models of the platform, as pure functions on frames.

Every function takes plain pandas/NumPy inputs and returns plain results, so
each can be unit-tested on synthetic data with a known answer.

Complexities use n = rows, p = features, k = clusters, d = tree depth:
* OLS (simple and multiple): O(n p^2) via a least-squares solve.
* MLR diagnostics: VIF O(n p^2 + p^3) from one correlation-matrix inverse;
  Breusch-Pagan one more O(n p^2) auxiliary regression.
* Regression / classification tree: O(p n log n) per level, depth <= 4.
* K-Means: O(i n k p) for i Lloyd iterations; silhouette O(n^2) is the cost
  driver when choosing k, acceptable at catalogue scale (n < 10^4).
* Hierarchical (Ward): O(n^2) time and memory for the distance matrix.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import norm as _norm
from sklearn.cluster import KMeans
from sklearn.linear_model import LinearRegression
from sklearn.metrics import balanced_accuracy_score, confusion_matrix, silhouette_score
from sklearn.model_selection import GroupKFold, KFold, cross_val_predict
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor, export_text

MAX_TREE_DEPTH = 4
_RNG = 42

# ------------------------------------------------- A. Simple linear regression


@dataclass(frozen=True)
class SimpleRegression:
    """Result of ``price = b0 + b1 * x``.

    Attributes:
        feature: Name of the explanatory variable.
        intercept: b0 (THB).
        slope: b1, marginal THB per unit of ``feature``.
        r2: Coefficient of determination on the fitted data.
        n: Observations used.
        residuals: ``price - fitted`` per input row (NaN where unused).
    """

    feature: str
    intercept: float
    slope: float
    r2: float
    n: int
    residuals: pd.Series


def simple_regression(x: pd.Series, y: pd.Series, feature: str) -> SimpleRegression:
    """Fit simple OLS on rows where both values are present.

    Closed form b1 = cov(x, y) / var(x), b0 = mean(y) - b1 mean(x): two
    vectorised passes, O(n).
    """
    mask = x.notna() & y.notna()
    xs, ys = x[mask].to_numpy(float), y[mask].to_numpy(float)
    if len(xs) < 3 or np.ptp(xs) == 0:
        raise ValueError(f"not enough variation in {feature} to fit a regression")
    x_mean, y_mean = xs.mean(), ys.mean()
    slope = float(((xs - x_mean) * (ys - y_mean)).sum() / ((xs - x_mean) ** 2).sum())
    intercept = float(y_mean - slope * x_mean)
    fitted = intercept + slope * xs
    ss_res = float(((ys - fitted) ** 2).sum())
    ss_tot = float(((ys - y_mean) ** 2).sum())
    residuals = pd.Series(np.nan, index=x.index)
    residuals[mask] = ys - fitted
    return SimpleRegression(feature, intercept, slope, 1 - ss_res / ss_tot, len(xs), residuals)


# ----------------------------------------------- B. Multiple linear regression


@dataclass(frozen=True)
class RegressionDiagnostics:
    """Classical OLS assumption checks on the in-sample fit of log(price).

    Diagnostics use the in-sample residuals of the final model (the textbook
    definition); the Deal Score uses out-of-fold residuals instead, which
    answer a different question (how far a listing sits from a fit that never
    saw its product).

    Attributes:
        vif: Variance inflation factor per feature, ``1 / (1 - R_j^2)``.
            Above 10 is the usual collinearity warning; interaction terms and
            their parents are collinear by construction.
        fitted: In-sample fitted log(price) per row.
        residual: In-sample residual log(price) - fitted per row.
        skew: Sample skewness of the residuals (0 under normality).
        excess_kurtosis: Sample excess kurtosis (0 under normality).
        jarque_bera: JB statistic, ``n/6 (S^2 + K^2/4)``, chi^2(2) under H0.
        jarque_bera_p: Its p-value.
        breusch_pagan: LM statistic ``n R^2`` of e^2 regressed on X,
            chi^2(p) under homoscedasticity.
        breusch_pagan_p: Its p-value.
    """

    vif: dict[str, float]
    fitted: np.ndarray
    residual: np.ndarray
    skew: float
    excess_kurtosis: float
    jarque_bera: float
    jarque_bera_p: float
    breusch_pagan: float
    breusch_pagan_p: float

    def summary(self) -> dict[str, Any]:
        """JSON-ready scalars (the per-row arrays are left out)."""
        return {
            "vif": self.vif,
            "max_vif": max(self.vif.values(), default=float("nan")),
            "skew": self.skew,
            "excess_kurtosis": self.excess_kurtosis,
            "jarque_bera": self.jarque_bera,
            "jarque_bera_p": self.jarque_bera_p,
            "breusch_pagan": self.breusch_pagan,
            "breusch_pagan_p": self.breusch_pagan_p,
            "n": int(len(self.residual)),
        }


def variance_inflation(x: np.ndarray, names: list[str]) -> dict[str, float]:
    """VIF of every column at once: the diagonal of the inverse correlation matrix.

    ``VIF_j = 1 / (1 - R_j^2) = [R^{-1}]_{jj}``, so one ``p x p`` inverse
    replaces p auxiliary regressions: O(n p^2) to form R plus O(p^3) to invert.
    A pseudo-inverse keeps exactly collinear columns finite (they show as very
    large values instead of an exception).
    """
    if x.shape[1] == 1:
        return {names[0]: 1.0}
    corr = np.corrcoef(x, rowvar=False)
    diag = np.diag(np.linalg.pinv(corr))
    return {n: float(v) for n, v in zip(names, diag, strict=True)}


def regression_diagnostics(
    x: np.ndarray, y: np.ndarray, model: LinearRegression, names: list[str]
) -> RegressionDiagnostics:
    """Residual normality, homoscedasticity and collinearity checks for an OLS fit.

    Args:
        x: Design matrix the model was fitted on, ``n x p``.
        y: Target it was fitted on.
        model: The fitted regression.
        names: Column names of ``x``.

    Returns:
        The diagnostics.
    """
    from scipy import stats

    fitted = model.predict(x)
    resid = y - fitted
    n, p = x.shape
    skew = float(stats.skew(resid))
    kurt = float(stats.kurtosis(resid))  # Fisher: excess kurtosis
    jb = n / 6 * (skew**2 + kurt**2 / 4)
    # Breusch-Pagan (Koenker's studentised form): regress e^2 on the same
    # regressors; under constant variance n * R^2 ~ chi^2(p).
    sq = resid**2
    aux = LinearRegression().fit(x, sq)
    ss_tot = float(((sq - sq.mean()) ** 2).sum())
    r2_aux = 1 - float(((sq - aux.predict(x)) ** 2).sum()) / ss_tot if ss_tot > 0 else 0.0
    bp = n * r2_aux
    return RegressionDiagnostics(
        vif=variance_inflation(x, names),
        fitted=fitted,
        residual=resid,
        skew=skew,
        excess_kurtosis=kurt,
        jarque_bera=float(jb),
        jarque_bera_p=float(stats.chi2.sf(jb, 2)),
        breusch_pagan=float(bp),
        breusch_pagan_p=float(stats.chi2.sf(bp, p)),
    )


@dataclass(frozen=True)
class FairValueModel:
    """Log-linear multiple regression of price on specs and demand.

    ``log(price) = b0 + sum(b_j * x_j) + e``. Coefficients are multiplicative:
    ``exp(b_j) - 1`` is the % price change per unit of ``x_j`` (per standard
    deviation when ``standardized``).

    Attributes:
        features: Feature names, in coefficient order.
        coefficients: b_j on the standardised features.
        intercept: b0.
        r2_cv: 5-fold cross-validated R^2 on log(price).
        mape_cv: Cross-validated mean absolute % error of the fair price.
        n: Rows the regression was fitted on (in stock, with required specs).
        fair_price: Out-of-fold fair price per row (THB).
        z_residual: Out-of-fold log residual per row over its prediction
            standard error, ``e / (s * sqrt(1 + h))``.
        leverage: Out-of-fold leverage ``h`` of each row against the fold
            that predicted it (NaN for unscored rows).
        extrapolated: Rows left unscored because ``h`` exceeded
            :data:`MAX_LEVERAGE`.
        sigma: Out-of-fold residual standard deviation ``s`` on log(price).
    """

    features: list[str]
    coefficients: list[float]
    intercept: float
    r2_cv: float
    mape_cv: float
    n: int
    fair_price: pd.Series
    z_residual: pd.Series
    leverage: pd.Series | None = None
    extrapolated: int = 0
    diagnostics: RegressionDiagnostics | None = None
    sigma: float = math.nan
    #: Cross-validation folds actually used (``folds`` clamped to the data).
    cv_folds: int = 0

    def error_pct(self) -> pd.Series:
        """Half-width of each row's 80% prediction interval, as a fraction.

        The interval is ``fair * exp(±z * s * sqrt(1 + h))`` on the log scale;
        ``sinh`` of the half-width is its symmetric "± Y%" reading (the true
        interval is slightly wider above than below). Rows far from the data
        the fold saw (high ``h``) get a wider band. O(n), vectorised.
        """
        if self.leverage is None:
            return pd.Series(np.nan, index=self.fair_price.index)
        se = self.sigma * np.sqrt(1 + self.leverage)
        band = pd.Series(np.sinh(Z_80 * se), index=self.leverage.index)
        return band.where(self.fair_price.notna())

    def coefficient_table(self) -> list[dict[str, float | str]]:
        """Coefficients with their % effect per standard deviation."""
        return [
            {"feature": f, "beta": b, "pct_effect_per_sd": math.expm1(b)}
            for f, b in zip(self.features, self.coefficients, strict=True)
        ]


def _usable_columns(features: pd.DataFrame) -> list[str]:
    """Columns at least 30% populated and not constant."""
    return [
        str(c) for c in features if features[c].notna().mean() >= 0.3 and features[c].nunique() > 1
    ]


def _impute(matrix: pd.DataFrame) -> pd.DataFrame:
    """Median-impute each column; columns that are entirely missing become 0."""
    return matrix.fillna(matrix.median(numeric_only=True)).fillna(0.0)


def _design_matrix(features: pd.DataFrame, required: list[str]) -> pd.DataFrame:
    """Median-impute optional features and add a 0/1 indicator per gap.

    Missingness is not random here: titles that omit a spec are mostly old or
    budget parts. A bare median imputation would give such a listing the specs
    of a mid-range product and a fair price several times its real one; the
    indicator lets the regression learn that group's own offset instead.
    Required columns are complete by construction (rows lacking them are
    excluded before this call).
    """
    imputed = _impute(features)
    flags = {
        f"{c}_missing": features[c].isna().astype(float)
        for c in features
        if c not in required and features[c].isna().any()
    }
    return pd.concat([imputed, pd.DataFrame(flags, index=features.index)], axis=1)


#: Out-of-fold leverage above which a row is not scored. h = x0'(X'X)^-1 x0
#: is the prediction variance in units of the residual variance; h > 1 means
#: the fit is less certain of the fair price than of a typical listing's
#: deviation from it, i.e. the row lies outside the specs the fold was fitted
#: on (a GT 1030 4GB priced from RTX-era cards). Its "deal" would be the
#: extrapolation error, so it gets no fair price rather than a guessed one.
MAX_LEVERAGE = 1.0

#: Coverage of the "± Y%" interval beside a fair price (persisted so the web
#: never hard-codes it): 80% is wide enough to be honest about a 15-25% MAPE
#: fit, narrow enough to tell a real gap from noise.
INTERVAL_LEVEL = 0.80
#: Its two-sided standard-normal quantile, derived so the two cannot drift
#: apart: norm.ppf(0.90) = 1.28155...
Z_80 = float(_norm.ppf(0.5 + INTERVAL_LEVEL / 2))


def _oof_predict(
    x: np.ndarray, y: np.ndarray, fit_rows: np.ndarray, splits: Any
) -> tuple[np.ndarray, np.ndarray]:
    """Out-of-fold OLS predictions and leverages.

    Each fold is fitted on its training rows that are in ``fit_rows`` and
    predicts all of its held-out rows. Leverage per held-out row is
    ``x0' (X'X)^+ x0`` (intercept included), computed for the whole fold in
    one einsum. O(folds * (n p^2 + p^3)).

    A column constant over a fold's training rows (a gap indicator whose only
    1 is held out) is collinear with the intercept. The pseudo-inverse would
    split the intercept onto it and its leverage would ignore that direction,
    so a held-out row differing there got an arbitrary prediction (e^-9 of
    the price) at ordinary leverage. Such columns are dropped from the fold's
    fit, and held-out rows that differ on one get infinite leverage: the fold
    has no data on that direction, so it cannot price them.
    """
    x1 = np.column_stack([np.ones(len(x)), x])
    pred = np.full(len(y), np.nan)
    lev = np.full(len(y), np.nan)
    for train, test in splits:
        train = train[fit_rows[train]]
        if len(train) <= x1.shape[1]:
            continue
        xt = x1[train]
        varies = np.ptp(xt, axis=0) > 1e-12
        varies[0] = True  # intercept
        unseen = (np.abs(x1[test][:, ~varies] - xt[0, ~varies]) > 1e-12).any(axis=1)
        xt, xs = xt[:, varies], x1[test][:, varies]
        gram_inv = np.linalg.pinv(xt.T @ xt)
        beta = gram_inv @ (xt.T @ y[train])
        pred[test] = xs @ beta
        lev[test] = np.where(unseen, np.inf, np.einsum("ij,jk,ik->i", xs, gram_inv, xs))
    return pred, lev


def fit_fair_value(
    features: pd.DataFrame,
    price: pd.Series,
    *,
    required: list[str] | None = None,
    groups: pd.Series | None = None,
    fit_mask: pd.Series | None = None,
    folds: int = 5,
) -> FairValueModel:
    """Fit the fair-value MLR and score each row out-of-fold.

    Out-of-fold predictions matter here: an in-sample fit would let each
    listing pull the regression line towards its own price and understate how
    under- or over-priced it is.

    Rows missing any ``required`` feature are neither fitted nor scored: their
    fair price and residual are NaN. A fair price for a CPU whose core count
    is unknown would be a guess, and a guessed fair price produces exactly the
    "90% below fair value" deals the score must never claim. For the same
    reason rows whose out-of-fold leverage exceeds :data:`MAX_LEVERAGE` are
    left unscored.

    The residual is standardised by its prediction standard error,
    ``s * sqrt(1 + h)``, not by ``s`` alone: a row far from the fitted data
    has an uncertain fair price, and the same residual is weaker evidence of
    a deal there.

    Args:
        features: Numeric feature columns (NaN allowed outside ``required``).
        price: Listing price in THB, aligned with ``features``.
        required: Features a row must have to be scored.
        groups: Product key per row. When given, folds split by product
            (GroupKFold): every listing of a model is predicted by a fit that
            saw none of them, so the fair price of a product is never learned
            from that product's own prices, and identical listings of it get
            one identical prediction instead of fold-dependent ones.
        fit_mask: Rows the regression may learn from (default all). Sold-out
            listings keep their last price for months; trained on, those stale
            prices (DDR4 kits at a pre-shortage 1,790 THB beside 4,600 THB
            in-stock ones) drag the line. They are still scored.
        folds: Cross-validation folds.

    Returns:
        The fitted model with out-of-fold fair prices and z-scored residuals
        (NaN for unscored rows). R^2 and MAPE are over fitted, scored rows.

    Raises:
        ValueError: If a required feature is unusable or too few rows remain.
    """
    usable = _usable_columns(features)
    if not usable:
        raise ValueError("no usable features for the fair-value model")
    required = required or []
    # A required feature must be populated enough to score on; a constant one
    # (every listing the same GPU generation) is fine: it carries no price
    # information, so it gates scoring but drops out of the design matrix.
    unusable = [c for c in required if c not in features or features[c].notna().mean() < 0.3]
    if unusable:
        raise ValueError(f"required features unusable: {unusable}")
    complete = features[required].notna().all(axis=1)  # all True when none required
    learn = (
        fit_mask.reindex(features.index).fillna(False).astype(bool)
        if fit_mask is not None
        else pd.Series(True, index=features.index)
    )
    if int((complete & learn).sum()) < 15:
        raise ValueError(f"only {int((complete & learn).sum())} rows have the required features")
    design = _design_matrix(features.loc[complete, usable], required)
    fit_rows = learn.loc[complete].to_numpy(bool)
    # A column must vary among the rows the fit learns from.
    design = design.loc[:, design.loc[fit_rows].nunique() > 1]
    columns = [str(c) for c in design.columns]
    all_price = price.loc[complete].to_numpy(float)
    x = StandardScaler().fit(design.loc[fit_rows]).transform(design)
    y = np.log(all_price)
    if groups is not None:
        fold_groups = groups.loc[complete].to_numpy()
        folds = max(2, min(folds, len(np.unique(fold_groups))))
        splits = GroupKFold(n_splits=folds).split(x, y, fold_groups)
    else:
        folds = max(2, min(folds, len(y) // 5))
        splits = KFold(n_splits=folds, shuffle=True, random_state=_RNG).split(x)
    oof_log, lev = _oof_predict(x, y, fit_rows, splits)
    model = LinearRegression().fit(x[fit_rows], y[fit_rows])

    resid = y - oof_log
    scored = np.isfinite(oof_log) & (lev <= MAX_LEVERAGE)
    fitted = fit_rows & scored
    sigma = float(resid[fitted].std(ddof=len(columns) + 1)) or 1.0
    # Duan's smearing: exp(E[log y]) underestimates E[y] under log-normal noise.
    smear = float(np.mean(np.exp(resid[fitted])))
    fair = np.where(scored, np.exp(oof_log) * smear, np.nan)
    z = np.where(scored, resid / (sigma * np.sqrt(1 + lev)), np.nan)
    y_fit = y[fitted]
    ss_res = float((resid[fitted] ** 2).sum())
    ss_tot = float(((y_fit - y_fit.mean()) ** 2).sum())
    return FairValueModel(
        features=columns,
        coefficients=[float(b) for b in model.coef_],
        intercept=float(model.intercept_),
        r2_cv=1 - ss_res / ss_tot,
        mape_cv=float(np.mean(np.abs(all_price[fitted] - fair[fitted]) / fair[fitted])),
        n=int(fit_rows.sum()),
        fair_price=pd.Series(fair, index=design.index).reindex(features.index),
        z_residual=pd.Series(z, index=design.index).reindex(features.index),
        leverage=pd.Series(lev, index=design.index).reindex(features.index),
        extrapolated=int((lev > MAX_LEVERAGE).sum()),  # NaN compares False
        diagnostics=regression_diagnostics(x[fit_rows], y[fit_rows], model, columns),
        sigma=sigma,
        cv_folds=folds,
    )


def deal_score(z_residual: pd.Series) -> pd.Series:
    """Map standardised residuals to a 0-100 Deal Score.

    ``score = 100 * (1 - Phi(z))``: 50 at fair value, about 84 one standard
    deviation below it, about 16 one above. Vectorised via ``erf``.
    """
    z = z_residual.to_numpy(float)
    phi = 0.5 * (1 + np.vectorize(math.erf)(z / math.sqrt(2)))
    return pd.Series(np.clip(np.rint(100 * (1 - phi)), 0, 100), index=z_residual.index)


# ------------------------------------------------ Tree structure for the web


def tree_nodes(
    model: DecisionTreeRegressor | DecisionTreeClassifier,
    features: list[str],
    *,
    log_target: bool = False,
    x: pd.DataFrame | np.ndarray | None = None,
    y: pd.Series | np.ndarray | None = None,
) -> list[dict[str, Any]]:
    """Serialise a fitted sklearn tree into JSON-ready nodes for a node-link chart.

    Nodes keep sklearn's pre-order ids, so node 0 is the root and a parent's
    id is always below its children's. Each node is
    ``{id, feature, threshold, left, right, n, value, impurity}``; leaves have
    ``feature``, ``threshold``, ``left`` and ``right`` set to ``None``. The
    left child holds the rows with ``feature <= threshold``.

    * Regressor: ``value`` is the node's mean target. With ``log_target`` the
      tree was fitted on ``log(price)``, so the mean is back-transformed to
      THB, ``exp(mean log price)`` (the node's geometric mean price), rounded
      to whole baht. ``impurity`` stays on the fitted (log) scale.
    * Classifier: sklearn stores (class-weighted) fractions in ``value``, not
      counts. ``value`` becomes ``{"counts": {class: rows}, "winner": class}``:
      ``winner`` is the class the tree predicts at the node (argmax of the
      weighted fractions, what ``predict`` returns); ``counts`` are raw
      training rows per class, from ``x`` / ``y`` via the decision path, else
      ``n * fraction`` (exact only without class weights).

    Cost: O(nodes * classes), plus O(n * depth) for the decision path.

    Args:
        model: A fitted DecisionTreeRegressor or DecisionTreeClassifier.
        features: Column names in the order the tree was fitted on.
        log_target: Regressor fitted on log(price); back-transform values.
        x: Training features (classifier counts only).
        y: Training labels aligned with ``x`` (classifier counts only).

    Returns:
        One dict per node, in id order.
    """
    tree = model.tree_
    left, right = tree.children_left, tree.children_right
    is_classifier = isinstance(model, DecisionTreeClassifier)
    counts: np.ndarray | None = None
    classes: list[str] = []
    if is_classifier:
        classes = [str(c) for c in model.classes_]
        if x is not None and y is not None:
            # path is n x nodes (0/1, sparse); path' @ onehot(y) counts every
            # training row once at each node it passes: O(n * depth * C).
            path = model.decision_path(x)
            labels = np.asarray(y).astype(str)
            onehot = (labels[:, None] == np.asarray(classes)[None, :]).astype(float)
            counts = np.asarray(path.T @ onehot)
        else:
            counts = tree.value[:, 0, :] * tree.n_node_samples[:, None]
    nodes: list[dict[str, Any]] = []
    for i in range(tree.node_count):
        leaf = left[i] == right[i]
        if is_classifier and counts is not None:
            value: Any = {
                "counts": {
                    c: int(round(float(v))) for c, v in zip(classes, counts[i], strict=True)
                },
                "winner": classes[int(np.argmax(tree.value[i, 0, :]))],
            }
        else:
            mean = float(tree.value[i, 0, 0])
            value = round(math.exp(mean)) if log_target else mean
        nodes.append(
            {
                "id": i,
                "feature": None if leaf else features[int(tree.feature[i])],
                "threshold": None if leaf else float(tree.threshold[i]),
                "left": None if leaf else int(left[i]),
                "right": None if leaf else int(right[i]),
                "n": int(tree.n_node_samples[i]),
                "value": value,
                "impurity": float(tree.impurity[i]),
            }
        )
    return nodes


# --------------------------------------------------------- C. Regression tree


@dataclass(frozen=True)
class TierTree:
    """Depth-limited regression tree segmenting price tiers.

    ``nodes`` is :func:`tree_nodes` of ``model`` with leaf values in THB.
    """

    rules: str
    r2_cv: float
    leaves: int
    model: DecisionTreeRegressor
    features: list[str]
    nodes: list[dict[str, Any]] = field(default_factory=list)


_LEAF_VALUE_RE = re.compile(r"value: \[(-?\d+(?:\.\d+)?)\]")


def fit_tier_tree(features: pd.DataFrame, price: pd.Series) -> TierTree:
    """Fit a regression tree (max depth 4) on log(price); report cross-validated R^2.

    The log target keeps a handful of workstation parts (10-100x the median
    price) from dominating the squared-error splits. Leaf values in the
    exported rules are converted back to THB for readability.
    """
    usable = _usable_columns(features)
    x = _impute(features[usable])
    y = np.log(price.to_numpy(float))
    tree = DecisionTreeRegressor(max_depth=MAX_TREE_DEPTH, min_samples_leaf=5, random_state=_RNG)
    folds = max(2, min(5, len(y) // 10))
    oof = cross_val_predict(tree, x, y, cv=KFold(folds, shuffle=True, random_state=_RNG))
    tree.fit(x, y)
    r2 = 1 - float(((y - oof) ** 2).sum()) / float(((y - y.mean()) ** 2).sum())
    rules = _LEAF_VALUE_RE.sub(
        lambda m: f"price ≈ ฿{math.exp(float(m.group(1))):,.0f}",
        export_text(tree, feature_names=usable, decimals=2),
    )
    return TierTree(
        rules=rules,
        r2_cv=r2,
        leaves=int(tree.get_n_leaves()),
        model=tree,
        features=usable,
        nodes=tree_nodes(tree, usable, log_target=True),
    )


# ---------------------------------------------------- D. K-Means segmentation

HIDDEN_GEM, FAVORITE, HYPE, NICHE = "hidden_gem", "community_favorite", "overpriced_hype", "niche"
#: Cluster-level name for centroids that sell clearly above average. Never a listing
#: label: :func:`split_best_sellers` divides their members by views into
#: :data:`FAVORITE` and :data:`HIDDEN_GEM`.
BEST_SELLERS = "best_sellers"
#: Listing labels in the fixed display order (the web's filter chips).
SEGMENT_LABELS = (HIDDEN_GEM, FAVORITE, HYPE, NICHE)
# Minimum gap, in standard deviations, between a centroid's views and sales.
_CONVERSION_MARGIN = 0.5
# Minimum sales_z, in standard deviations, of a best-selling centroid (SPEC
# round 9 addendum, rule A). With the within-store rank feature a cluster of
# much-viewed models selling about average sat at sales_z = 0.002 and, at
# "> 0", was named best sellers (19 of its models had zero sales); the same
# margin as for conversion keeps such clusters hype or niche.
_BEST_SELLER_MARGIN = _CONVERSION_MARGIN
#: The two margins under public names: persisted in the K-Means payload so the
#: web states the rule it explains instead of a number written into its copy.
CONVERSION_MARGIN_SD = _CONVERSION_MARGIN
BEST_SELLER_MARGIN_SD = _BEST_SELLER_MARGIN
#: The clustered features in column order, as stored in ``demand_driver``.
DEMAND_DIMENSIONS = ("views", "sales", "price")


def deciding_dimension(
    x: np.ndarray, centers: np.ndarray, assigned: np.ndarray, names: list[str]
) -> np.ndarray:
    """Per row, the feature that most keeps it in its cluster (SPEC round 16).

    K-Means assigns a row to the nearest centroid over all three standardised
    features at once, so a model can sit in "few views, few sales" with views
    above the typical model: another feature outweighed them. For each row
    this takes the nearest centroid whose *name* differs from its own
    cluster's (the group it would otherwise read as) and splits the squared
    distance gap by feature::

        d(x, rival)^2 - d(x, own)^2 = sum_j [(x_j - rival_j)^2 - (x_j - own_j)^2]

    The feature with the largest term is the one that most favours the own
    cluster over that rival. One ``n x k x p`` broadcast: O(n k p), no
    per-row Python.

    Args:
        x: Standardised feature matrix, ``n x p`` in :data:`DEMAND_DIMENSIONS` order.
        centers: Cluster centroids, ``k x p``.
        assigned: Cluster index per row.
        names: Cluster name per centroid (:func:`name_segments`).

    Returns:
        One of :data:`DEMAND_DIMENSIONS` per row, or ``None`` where every
        cluster shares the row's name (no rival to compare with).
    """
    squared = (x[:, None, :] - centers[None, :, :]) ** 2  # n x k x p
    name = np.asarray(names, dtype=object)
    rivals = name[None, :] != name[assigned][:, None]  # n x k
    distance = np.where(rivals, squared.sum(axis=2), np.inf)
    rival = distance.argmin(axis=1)
    rows = np.arange(len(x))
    gain = squared[rows, rival, :] - squared[rows, assigned, :]  # n x p
    dimension = np.asarray(DEMAND_DIMENSIONS, dtype=object)[gain.argmax(axis=1)]
    return np.where(rivals.any(axis=1), dimension, None)


def name_segments(centers: list[tuple[float, float]]) -> list[str]:
    """Name clusters from their standardised (views_z, sales_z) centroids.

    * best sellers: centroids that sell clearly above average
      (``sales_z >`` :data:`_BEST_SELLER_MARGIN`, 0.5 SD). Their
      listings are split by views afterwards (:func:`split_best_sellers`), so
      both well-selling profiles of CLAUDE.md section 2D, community favourite
      (many views) and hidden gem (few views), are read from the listings
      rather than from one centroid each;
    * overpriced hype: the other centroids whose views exceed sales by the
      margin (attention that does not convert);
    * niche: everything else (little attention, few sales).

    Args:
        centers: ``(views_z, sales_z)`` per cluster.

    Returns:
        One name per cluster, in input order.
    """
    names = [NICHE] * len(centers)
    for i, (views, sales) in enumerate(centers):
        if sales > _BEST_SELLER_MARGIN:
            names[i] = BEST_SELLERS
        elif views - sales > _CONVERSION_MARGIN:
            names[i] = HYPE
    return names


def split_best_sellers(
    cluster_names: np.ndarray, log_views: np.ndarray
) -> tuple[np.ndarray, float | None]:
    """Turn cluster names into listing labels, splitting best sellers by views.

    Every listing of a :data:`BEST_SELLERS` cluster becomes :data:`FAVORITE`
    when its ``log1p(views)`` exceeds the median over all best-seller listings
    (pooled across such clusters), else :data:`HIDDEN_GEM`. Other listings
    keep their cluster's name. One masked median plus one ``np.where``: O(n),
    vectorised, no per-row Python.

    Args:
        cluster_names: Name of each listing's cluster (from :func:`name_segments`).
        log_views: ``log1p(views)`` per listing, aligned with ``cluster_names``.

    Returns:
        The listing labels and the median ``log1p(views)`` used for the split
        (``None`` when no cluster is a best seller).
    """
    sellers = cluster_names == BEST_SELLERS
    if not sellers.any():
        return cluster_names.astype(object), None
    median = float(np.median(log_views[sellers]))
    split = np.where(log_views > median, FAVORITE, HIDDEN_GEM)
    return np.where(sellers, split, cluster_names).astype(object), median


#: Ward linkage keeps an O(n^2) condensed distance matrix (8 bytes per pair):
#: 5,000 points is ~100 MB, the most a scheduled CI runner should spend.
MAX_HIERARCHICAL_N = 5_000


@dataclass(frozen=True)
class HierarchyComparison:
    """Agglomerative (Ward) clustering of the same matrix, cut at K-Means' k.

    Attributes:
        k: Number of clusters the dendrogram was cut into.
        silhouette: Silhouette of the hierarchical partition.
        ari_vs_kmeans: Adjusted Rand index against the K-Means labels: 1 is
            the same partition, ~0 is chance agreement.
        cophenetic_corr: Correlation between pairwise distances and the
            dendrogram heights at which pairs merge; how faithfully the tree
            represents the geometry (> 0.7 is commonly read as good).
        linkage: SciPy linkage matrix, ``(n - 1) x 4``, for the dendrogram.
    """

    k: int
    silhouette: float
    ari_vs_kmeans: float
    cophenetic_corr: float
    linkage: np.ndarray


def compare_hierarchical(x: np.ndarray, kmeans_labels: np.ndarray, k: int) -> HierarchyComparison:
    """Fit Ward-linkage agglomerative clustering and compare it with K-Means.

    Ward merges, at every step, the pair of clusters whose union least
    increases total within-cluster variance, the same objective K-Means
    minimises, so agreement (high ARI) means the K-Means partition is not an
    artefact of its random initialisation. Cost: O(n^2) memory and O(n^2)
    time with SciPy's nearest-neighbour chain algorithm.

    Args:
        x: Standardised feature matrix, ``n x p``.
        kmeans_labels: K-Means cluster index per row.
        k: Cluster count to cut the dendrogram at.

    Returns:
        The comparison.

    Raises:
        ValueError: If ``n`` exceeds :data:`MAX_HIERARCHICAL_N`.
    """
    from scipy.cluster.hierarchy import cophenet, fcluster, linkage
    from scipy.spatial.distance import pdist
    from sklearn.metrics import adjusted_rand_score

    if len(x) > MAX_HIERARCHICAL_N:
        raise ValueError(f"{len(x)} points exceed the hierarchical limit of {MAX_HIERARCHICAL_N}")
    distances = pdist(x)  # condensed, contiguous float64: computed once, reused twice
    tree = linkage(distances, method="ward")
    labels = fcluster(tree, t=k, criterion="maxclust")
    cophenetic, _ = cophenet(tree, distances)
    return HierarchyComparison(
        k=k,
        silhouette=float(silhouette_score(x, labels)) if len(set(labels)) > 1 else float("nan"),
        ari_vs_kmeans=float(adjusted_rand_score(kmeans_labels, labels)),
        cophenetic_corr=float(cophenetic),
        linkage=tree,
    )


#: Branches kept at the top of the web's dendrogram: thousands of leaves are
#: unreadable, and the k-cluster cut is decided near the top.
DENDROGRAM_BRANCHES = 30


def cut_height(linkage: np.ndarray, k: int) -> float | None:
    """Merge height halfway between the merges that leave k and k - 1 clusters.

    A horizontal line there crosses exactly k branches, the same partition as
    ``fcluster(linkage, k, "maxclust")``. O(1).

    Args:
        linkage: SciPy linkage matrix, ``(n - 1) x 4``, heights in column 2.
        k: Number of clusters the cut should leave.

    Returns:
        The cut height, or ``None`` when k < 2 or k exceeds the merges.
    """
    if k < 2 or k > len(linkage):
        return None
    return float((linkage[-k, 2] + linkage[-k + 1, 2]) / 2)


def truncated_dendrogram(
    linkage: np.ndarray, k: int, branches: int = DENDROGRAM_BRANCHES
) -> dict[str, Any]:
    """Top of a Ward dendrogram as plain line segments, plus the k-cluster cut.

    SciPy's ``dendrogram(truncate_mode="lastp")`` keeps the last ``branches``
    merges; each drawn link is a "∩" of four points (``icoord`` x, ``dcoord``
    height). Leaf ``i`` sits at x = 10 i + 5, and ``leaf_sizes`` says how
    many rows hang below it. O(branches) once the linkage exists.

    Args:
        linkage: SciPy linkage matrix, ``(n - 1) x 4``.
        k: Clusters the tree is cut into.
        branches: Leaves kept at the top.

    Returns:
        ``icoord``, ``dcoord`` (heights rounded to 4 decimals),
        ``leaf_sizes`` and ``cut_height`` (``None`` for k < 2).
    """
    from scipy.cluster.hierarchy import dendrogram

    tree = dendrogram(linkage, truncate_mode="lastp", p=branches, no_plot=True)
    sizes = [int(s.strip("()")) if s.startswith("(") else 1 for s in tree["ivl"]]
    cut = cut_height(linkage, k)
    return {
        "icoord": [[round(float(v), 2) for v in seg] for seg in tree["icoord"]],
        "dcoord": [[round(float(v), 4) for v in seg] for seg in tree["dcoord"]],
        "leaf_sizes": sizes,
        "cut_height": None if cut is None else round(cut, 4),
    }


@dataclass(frozen=True)
class DemandSegments:
    """K-Means over ``[log(views+1), sales signal, normalised price]``.

    The sales signal is the within-store sales percentile (``sales_rank_pct``,
    2026.11-v9+) when :func:`segment_demand` gets one, else
    ``log(sales/day+1)``.

    Attributes:
        k: Chosen cluster count.
        silhouette: Silhouette of the chosen partition.
        centroids: One entry per K-Means cluster (z-scores and unscaled means);
            ``split_by_views`` marks the best-seller clusters whose listings
            were divided into community favourites and hidden gems.
        labels: Listing label per input row (``None`` without demand data).
        segments: Summary per listing label, computed from the listings
            themselves, in :data:`SEGMENT_LABELS` order; labels without
            members are omitted.
        split_views: Views at the best-seller split (the median of
            ``log1p(views)``, back-transformed), or ``None`` when no cluster
            is a best seller.
        silhouette_by_k: Silhouette per candidate k.
        hierarchy: Ward comparison, when ``n`` is small enough.
        drivers: Per input row, the feature that most keeps it in its cluster
            (:func:`deciding_dimension`); ``None`` for unclustered rows.
        reference: Medians over every clustered row (``views_median``,
            ``normalized_price_median`` and, when given, ``sales_rank_pct_median``
            and ``sales_beats_pct_median``) plus ``n``: what "more views than
            the typical model" is measured against on the web.
    """

    k: int
    silhouette: float
    centroids: list[dict[str, float | str | bool]]
    labels: pd.Series
    segments: list[dict[str, float | int | str]] = field(default_factory=list)
    split_views: float | None = None
    silhouette_by_k: dict[int, float] = field(default_factory=dict)
    hierarchy: HierarchyComparison | None = None
    drivers: pd.Series | None = None
    reference: dict[str, float | int] = field(default_factory=dict)


_SEGMENT_STATS = (
    "views",
    "views_median",
    "sales_per_day",
    "sales_per_day_median",
    "normalized_price",
)


def summarise_segments(
    labels: pd.Series,
    views: pd.Series,
    sales_per_day: pd.Series,
    normalized_price: pd.Series,
    sales_rank_pct: pd.Series | None = None,
    sales_beats_pct: pd.Series | None = None,
) -> list[dict[str, float | int | str]]:
    """Per-label size and demand averages from the listings themselves.

    One ``groupby`` over contiguous float columns: O(n).

    Args:
        labels: Listing label per row (rows without a label are skipped).
        views: Cumulative page views.
        sales_per_day: Sales velocity (negative values clipped to 0), raw as
            measured. For reporting only: per model it sums store metrics
            that are not comparable (SPEC round 9).
        normalized_price: Price relative to the model's typical price.
        sales_rank_pct: Within-store sales percentile per row (average rank,
            the clustered feature); when given, its mean per label is added.
        sales_beats_pct: Share of the store's listings that sold strictly
            less (the shopper-facing figure); when given, its mean per label
            is added.

    Returns:
        One dict per label that has members, in :data:`SEGMENT_LABELS` order.
    """
    frame = pd.DataFrame(
        {
            "label": labels,
            "views": views.astype(float),
            "sales_per_day": sales_per_day.astype(float).clip(lower=0),
            "normalized_price": normalized_price.astype(float),
        }
    )
    stats: tuple[str, ...] = _SEGMENT_STATS
    aggregations: dict[str, tuple[str, str]] = {
        "size": ("views", "size"),
        "views": ("views", "mean"),
        "views_median": ("views", "median"),
        "sales_per_day": ("sales_per_day", "mean"),
        "sales_per_day_median": ("sales_per_day", "median"),
        "normalized_price": ("normalized_price", "mean"),
        "normalized_price_median": ("normalized_price", "median"),
    }
    stats = (*stats, "normalized_price_median")
    optional = {"sales_rank_pct": sales_rank_pct, "sales_beats_pct": sales_beats_pct}
    for column, values in optional.items():
        if values is not None:
            frame[column] = values.astype(float)
            # Mean and (2026.11-v14) median: the web compares a group's
            # typical model with the typical model overall.
            stats = (*stats, column, f"{column}_median")
            aggregations[column] = (column, "mean")
            aggregations[f"{column}_median"] = (column, "median")
    grouped = frame.dropna(subset=["label"]).groupby("label").agg(**aggregations)
    return [
        {
            "label": label,
            "size": int(grouped.at[label, "size"]),
            **{column: float(grouped.at[label, column]) for column in stats},
        }
        for label in SEGMENT_LABELS
        if label in grouped.index
    ]


def segment_demand(
    views: pd.Series,
    sales_per_day: pd.Series,
    normalized_price: pd.Series,
    *,
    sales_rank_pct: pd.Series | None = None,
    sales_beats_pct: pd.Series | None = None,
    k_range: range = range(4, 7),
) -> DemandSegments:
    """Cluster rows by demand and label each row.

    Training passes one row per product model (``train.model_demand``: views
    summed over stores, sales as the mean within-store percentile), so every
    listing of a model shares one label; the function itself is agnostic to
    what a row is, and docstrings below say "listing" for a row.

    The sales feature is ``sales_rank_pct`` when given (SPEC round 9: stores
    measure sales differently, JIB from its published sold counter and
    IHAVECPU from warehouse stock drawdown, so only ranks within a store are
    comparable), else ``log1p(sales_per_day)``. ``sales_per_day`` is still
    summarised raw per label (and per centroid) either way, for reporting
    only: per model it sums store metrics that are not comparable.

    k is chosen by silhouette score within ``k_range``; the floor of 4 follows
    the specification's three demand profiles plus a remainder segment.
    Clusters are named by :func:`name_segments`; the listings of clusters that
    are best sellers are then split by views (:func:`split_best_sellers`).

    Args:
        views: Cumulative page views.
        sales_per_day: Sales velocity.
        normalized_price: Price relative to the model's typical price.
        sales_rank_pct: Within-store sales percentile in ``(0, 1]``; replaces
            ``log1p(sales_per_day)`` as the clustered sales feature.
        sales_beats_pct: Share of the store's listings that sold strictly
            less; not clustered, only summarised per label for display.
        k_range: Candidate cluster counts.

    Returns:
        The segmentation, indexed like ``views``; rows with missing inputs get
        no label.
    """
    clipped_sales = sales_per_day.astype(float).clip(lower=0)
    raw = pd.DataFrame(
        {
            "log_views": np.log1p(views.astype(float)),
            "sales": np.log1p(clipped_sales)
            if sales_rank_pct is None
            else sales_rank_pct.astype(float),
            "normalized_price": normalized_price.astype(float),
        }
    ).dropna()
    if len(raw) < max(k_range.start * 5, 15):
        raise ValueError(f"only {len(raw)} rows have demand data; too few to cluster")
    scaler = StandardScaler()
    x = scaler.fit_transform(raw)

    scores: dict[int, float] = {}
    fits: dict[int, KMeans] = {}
    for k in k_range:
        if k >= len(raw):
            break
        km = KMeans(n_clusters=k, n_init=10, random_state=_RNG).fit(x)
        fits[k], scores[k] = km, float(silhouette_score(x, km.labels_))
    best_k = max(scores, key=lambda k: scores[k])
    km = fits[best_k]

    names = name_segments([(float(c[0]), float(c[1])) for c in km.cluster_centers_])
    listing_labels, split_log_views = split_best_sellers(
        np.asarray(names, dtype=object)[km.labels_], raw["log_views"].to_numpy(float)
    )
    # With the rank feature the centroid's sales coordinate is a percentile,
    # not a rate; the raw rate is then the members' mean (one groupby, O(n)).
    member_sales = clipped_sales.loc[raw.index].groupby(km.labels_).mean()
    centroids: list[dict[str, float | str | bool]] = []
    for idx, center in enumerate(km.cluster_centers_):
        views_z, sales_z, price_z = (float(v) for v in center)
        unscaled = scaler.inverse_transform(center.reshape(1, -1))[0]
        sales_fields = (
            {"sales_per_day": float(math.expm1(unscaled[1]))}
            if sales_rank_pct is None
            else {
                "sales_per_day": float(member_sales.get(idx, math.nan)),
                "sales_rank_pct": float(unscaled[1]),
            }
        )
        centroids.append(
            {
                "cluster": idx,
                "label": names[idx],
                "split_by_views": names[idx] == BEST_SELLERS,
                "size": int((km.labels_ == idx).sum()),
                "views_z": views_z,
                "sales_z": sales_z,
                "price_z": price_z,
                "views": float(math.expm1(unscaled[0])),
                # The scatter's x axis (2026.11-v13): the centroid in log1p(views).
                "log_views": float(unscaled[0]),
                **sales_fields,
                "normalized_price": float(unscaled[2]),
            }
        )
    labels = pd.Series(None, index=views.index, dtype="object")
    labels[raw.index] = listing_labels
    drivers = pd.Series(None, index=views.index, dtype="object")
    drivers[raw.index] = deciding_dimension(x, km.cluster_centers_, km.labels_, names)
    # Medians over the clustered rows, raw units (one pass each, O(n)).
    reference: dict[str, float | int] = {
        "n": int(len(raw)),
        "views_median": float(views.astype(float).loc[raw.index].median()),
        "normalized_price_median": float(raw["normalized_price"].median()),
    }
    if sales_rank_pct is not None:
        reference["sales_rank_pct_median"] = float(raw["sales"].median())
    if sales_beats_pct is not None:
        reference["sales_beats_pct_median"] = float(
            sales_beats_pct.astype(float).loc[raw.index].median()
        )
    hierarchy = (
        compare_hierarchical(x, km.labels_, best_k) if len(x) <= MAX_HIERARCHICAL_N else None
    )
    return DemandSegments(
        k=best_k,
        silhouette=scores[best_k],
        centroids=centroids,
        labels=labels,
        segments=summarise_segments(
            labels, views, sales_per_day, normalized_price, sales_rank_pct, sales_beats_pct
        ),
        # Rounded: expm1(log1p(v)) of a model sitting on the split gives
        # 1731.9999999999995 for v = 1732, and the stored threshold should
        # be the model's own view count (the split itself is taken on logs).
        split_views=None if split_log_views is None else round(math.expm1(split_log_views), 6),
        silhouette_by_k=scores,
        hierarchy=hierarchy,
        drivers=drivers,
        reference=reference,
    )


# ------------------------------------------ E. Buy / Wait decision tree


BUY_NOW, WAIT, FAIR = "buy_now", "wait", "fair_price"
#: Labelling and acceptance settings of the timing tree; persisted in its
#: payload so the web quotes the values actually used.
TIMING_HORIZON_DAYS = 35.0
TIMING_MIN_LOOKAHEAD_DAYS = 14.0
TIMING_DROP_PCT = 0.03
#: Stock at or below this share of today's counts as scarcity ("buy_now").
TIMING_STOCK_SHARE = 0.5
TIMING_TEST_FRACTION = 0.25
MIN_BALANCED_ACCURACY = 0.6
TIMING_FEATURES = [
    "pct_vs_model_median",
    "price_percentile_own",
    "pct_change_prev",
    "sales_per_day",
    "days_listed",
]


def label_price_paths(
    history: pd.DataFrame,
    *,
    horizon_days: float = TIMING_HORIZON_DAYS,
    min_lookahead_days: float = TIMING_MIN_LOOKAHEAD_DAYS,
    drop_pct: float = TIMING_DROP_PCT,
) -> pd.DataFrame:
    """Turn observation history into supervised timing examples.

    For each observation at time t whose future is observed for at least
    ``min_lookahead_days`` within the horizon, the outcome over
    (t, t + horizon] defines the label. Observations followed only by a few
    hours of data are skipped: the price has had no chance to move, and
    labelling them "fair" would swamp the classes with uninformative examples.

    * ``wait``: the price later fell by at least ``drop_pct``;
    * ``buy_now``: otherwise, the item went out of stock or its stock fell by
      half (scarcity: waiting risks losing it);
    * ``fair_price``: otherwise (stable).

    Features use only information available at t (no look-ahead): price vs
    the median price of the same canonical model on that day, the price's
    percentile within the listing's own past, change since the previous
    observation, recent sales velocity and days since first seen.

    Runs per listing over its sorted observations: O(n * m) for m
    observations inside a horizon, near-linear in practice.

    Args:
        history: Output of :func:`pricewatch.ml.dataset.load_history`.
        horizon_days: Look-ahead window for the outcome.
        min_lookahead_days: Minimum observed future needed to label a point.
        drop_pct: Minimum relative price drop that counts as "wait".

    Returns:
        One row per labelled observation with :data:`TIMING_FEATURES`,
        ``label`` and ``scraped_at``.
    """
    if history.empty:
        return pd.DataFrame(columns=[*TIMING_FEATURES, "label", "scraped_at"])
    hist = history.copy()
    hist["day"] = hist["scraped_at"].dt.floor("D")
    day_median = hist.groupby(["canonical_id", "day"])["price"].transform("median")
    hist["pct_vs_model_median"] = (hist["price"] / day_median - 1).where(
        hist["canonical_id"].notna()
    )

    # Naive UTC datetime64 throughout: tz-aware pandas values become object
    # arrays in NumPy, which are slow and cannot mix with naive timestamps.
    hist["scraped_at"] = pd.to_datetime(hist["scraped_at"], utc=True).dt.tz_localize(None)
    hist["first_seen_at"] = pd.to_datetime(hist["first_seen_at"], utc=True).dt.tz_localize(None)
    hist = hist.sort_values(["listing_id", "scraped_at"], kind="stable")

    examples: list[dict[str, Any]] = []
    horizon = np.timedelta64(int(horizon_days * 86400), "s")
    min_lookahead = np.timedelta64(int(min_lookahead_days * 86400), "s")
    for _, obs in hist.groupby("listing_id", sort=False):
        times = obs["scraped_at"].to_numpy("datetime64[ns]")
        first_seen = obs["first_seen_at"].to_numpy("datetime64[ns]")
        prices = obs["price"].to_numpy(float)
        stock_ok = obs["in_stock"].to_numpy(bool)
        qty = obs["stock_quantity"].to_numpy(float)
        sold = obs["sold_count"].to_numpy(float)
        for i in range(len(obs)):
            later = (times > times[i]) & (times <= times[i] + horizon)
            if not later.any() or times[later].max() - times[i] < min_lookahead:
                continue
            future_min = prices[later].min()
            if future_min <= prices[i] * (1 - drop_pct):
                label = WAIT
            elif stock_ok[i] and (
                (~stock_ok[later]).any()
                or (
                    qty[i] > 0
                    and np.nanmin(np.where(later, qty, np.nan)) <= qty[i] * TIMING_STOCK_SHARE
                )
            ):
                label = BUY_NOW
            else:
                label = FAIR
            past = prices[: i + 1]
            days_since_prev = (
                (times[i] - times[i - 1]) / np.timedelta64(1, "D") if i > 0 else np.nan
            )
            examples.append(
                {
                    "pct_vs_model_median": obs["pct_vs_model_median"].iloc[i],
                    "price_percentile_own": float((past <= prices[i]).mean()),
                    "pct_change_prev": prices[i] / prices[i - 1] - 1 if i > 0 else 0.0,
                    "sales_per_day": (sold[i] - sold[i - 1]) / days_since_prev
                    if i > 0 and days_since_prev > 0
                    else np.nan,
                    "days_listed": (times[i] - first_seen[i]) / np.timedelta64(1, "D"),
                    "label": label,
                    "scraped_at": times[i],
                }
            )
    # Explicit columns so "no labelled examples" is an empty frame, not a shapeless one.
    return pd.DataFrame(examples, columns=[*TIMING_FEATURES, "label", "scraped_at"])


@dataclass(frozen=True)
class TimingModel:
    """Depth-limited classification tree recommending buy / wait / fair."""

    model: DecisionTreeClassifier
    features: list[str]
    rules: str
    accuracy_test: float
    baseline_accuracy_test: float
    balanced_accuracy_test: float
    baseline_balanced_accuracy: float
    usable: bool
    confusion: list[list[int]]
    classes: list[str]
    n_train: int
    n_test: int
    class_counts: dict[str, int]
    medians: dict[str, float]
    #: :func:`tree_nodes` with raw training counts per class at every node.
    nodes: list[dict[str, Any]] = field(default_factory=list)


def fit_timing_tree(
    examples: pd.DataFrame,
    *,
    test_fraction: float = TIMING_TEST_FRACTION,
    min_balanced_accuracy: float = MIN_BALANCED_ACCURACY,
) -> TimingModel:
    """Train the Buy/Wait tree with a chronological train/test split.

    Splitting by time rather than at random prevents the model from learning
    from the future of the very periods it is tested on. Classes are heavily
    imbalanced (most prices are stable), so the tree is judged on balanced
    accuracy, the mean per-class recall, whose chance level is 1 / classes.
    It is marked ``usable`` (allowed to drive user-facing advice) only at
    ``min_balanced_accuracy`` or better, well clear of chance;
    plain accuracy is reported too but is dominated by the majority class.
    """
    if len(examples) < 40 or examples["label"].nunique() < 2:
        raise ValueError(
            f"{len(examples)} labelled examples with {examples['label'].nunique()} classes; "
            "not enough history to train the timing tree"
        )
    ordered = examples.sort_values("scraped_at")
    cut = int(len(ordered) * (1 - test_fraction))
    train, test = ordered.iloc[:cut], ordered.iloc[cut:]
    medians = {f: float(np.nan_to_num(train[f].median())) for f in TIMING_FEATURES}
    x_train = train[TIMING_FEATURES].fillna(medians)
    x_test = test[TIMING_FEATURES].fillna(medians)
    tree = DecisionTreeClassifier(
        max_depth=MAX_TREE_DEPTH, min_samples_leaf=10, class_weight="balanced", random_state=_RNG
    ).fit(x_train, train["label"])
    predicted = tree.predict(x_test)
    majority = train["label"].mode()[0]
    classes = [str(c) for c in tree.classes_]
    present = sorted(set(test["label"]))
    balanced = float(balanced_accuracy_score(test["label"], predicted)) if present else 0.0
    chance = 1 / max(len(present), 1)
    return TimingModel(
        model=tree,
        features=TIMING_FEATURES,
        rules=export_text(tree, feature_names=TIMING_FEATURES, decimals=3),
        accuracy_test=float((predicted == test["label"].to_numpy()).mean()),
        baseline_accuracy_test=float((test["label"] == majority).mean()),
        balanced_accuracy_test=balanced,
        baseline_balanced_accuracy=chance,
        usable=len(present) >= 2 and balanced >= min_balanced_accuracy,
        confusion=confusion_matrix(test["label"], predicted, labels=classes).tolist(),
        classes=classes,
        n_train=len(train),
        n_test=len(test),
        class_counts={str(k): int(v) for k, v in examples["label"].value_counts().items()},
        medians=medians,
        nodes=tree_nodes(tree, TIMING_FEATURES, x=x_train, y=train["label"]),
    )


def explain_path(model: TimingModel, row: pd.Series) -> str:
    """Render the decision path of one row as readable split conditions."""
    tree = model.model.tree_
    x = row[model.features].astype(float).fillna(pd.Series(model.medians)).to_numpy()
    node, steps = 0, []
    while tree.children_left[node] != tree.children_right[node]:
        feature, threshold = model.features[tree.feature[node]], tree.threshold[node]
        if x[tree.feature[node]] <= threshold:
            steps.append(f"{feature} <= {threshold:.3g}")
            node = tree.children_left[node]
        else:
            steps.append(f"{feature} > {threshold:.3g}")
            node = tree.children_right[node]
    return " AND ".join(steps)
